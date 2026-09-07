import { z } from "zod";

import { requireApiUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EstadoSolicitud } from "@/types";

export const runtime = "nodejs";

const cuerpoSchema = z.object({
  estado: z.enum(["borrador", "enviada", "aprobada", "rechazada"]),
  referencia_aprobacion: z.string().nullable().optional(),
  nota_resolucion: z.string().nullable().optional(),
});

/** Transiciones permitidas. Fuera de esto, el cambio se rechaza. */
const TRANSICIONES: Record<EstadoSolicitud, EstadoSolicitud[]> = {
  borrador: ["enviada"],
  enviada: ["aprobada", "rechazada", "borrador"],
  aprobada: ["enviada"], // revertir una aprobación cargada por error
  rechazada: ["borrador"],
};

/**
 * Cambia el estado de una solicitud.
 *
 * La aprobación ocurre fuera de la app (Charles y finanzas). Acá el solicitante
 * la confirma, y recién en ese momento el extra plan entra al presupuesto.
 * Revertir una aprobación descarta las líneas que había cargado.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const auth = await requireApiUser(supabase);
    if ("response" in auth) return auth.response;

    const parsed = cuerpoSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 },
      );
    }
    const cuerpo = parsed.data;
    const destino = cuerpo.estado;

    const { data: solicitud, error: errorLectura } = await supabase
      .from("solicitudes")
      .select("id, tipo, estado, id_oi, id_ceco, fy, trimestre, monto_solicitado")
      .eq("id", id)
      .maybeSingle();

    if (errorLectura) {
      console.error("[PATCH /api/solicitudes/:id/estado]", errorLectura);
      return Response.json({ error: "No se pudo leer la solicitud." }, { status: 400 });
    }
    if (!solicitud) {
      return Response.json({ error: "La solicitud no existe" }, { status: 404 });
    }

    const actual = solicitud.estado as EstadoSolicitud;
    if (!TRANSICIONES[actual].includes(destino)) {
      return Response.json(
        { error: `No se puede pasar de "${actual}" a "${destino}".` },
        { status: 400 },
      );
    }

    // --- Al aprobar un extra plan, sus líneas entran al presupuesto ---------
    if (destino === "aprobada" && solicitud.tipo === "extra_plan") {
      const { data: yaCargado, error: errorYaCargado } = await supabase
        .from("presupuestos")
        .select("id")
        .eq("id_solicitud", id)
        .limit(1);

      if (errorYaCargado) {
        console.error("[PATCH /api/solicitudes/:id/estado]", errorYaCargado);
        return Response.json(
          { error: "No se pudo verificar si ya se había cargado." },
          { status: 400 },
        );
      }

      if ((yaCargado ?? []).length === 0) {
        const { data: lineas, error: errorLineas } = await supabase
          .from("solicitud_lineas")
          .select("mes, monto, cuenta_contable, descripcion_cuenta, tipo_gasto, detalle_gasto, responsable")
          .eq("id_solicitud", id);

        if (errorLineas) {
          console.error("[PATCH /api/solicitudes/:id/estado]", errorLineas);
          return Response.json(
            { error: "No se pudieron leer las líneas de la solicitud." },
            { status: 400 },
          );
        }
        if ((lineas ?? []).length === 0) {
          return Response.json(
            { error: "La solicitud no tiene líneas que cargar" },
            { status: 400 },
          );
        }

        const { error: errorCarga } = await supabase.from("presupuestos").insert(
          (lineas ?? []).map((l) => ({
            id_oi: solicitud.id_oi,
            id_ceco: solicitud.id_ceco,
            tipo: "extra_plan" as const,
            fy: solicitud.fy,
            mes: Number(l.mes),
            monto: Number(l.monto),
            cuenta_contable: l.cuenta_contable as string | null,
            descripcion_cuenta: l.descripcion_cuenta as string | null,
            tipo_gasto: l.tipo_gasto as string | null,
            detalle_gasto: l.detalle_gasto as string | null,
            responsable: l.responsable as string | null,
            id_solicitud: id,
          })),
        );

        if (errorCarga) {
          console.error("[PATCH /api/solicitudes/:id/estado]", errorCarga);
          return Response.json(
            { error: "No se pudo cargar al presupuesto." },
            { status: 400 },
          );
        }
      }
    }

    // --- Al revertir una aprobación, se descarta lo que había cargado -------
    if (actual === "aprobada" && destino !== "aprobada") {
      const { error: errorBorrado } = await supabase
        .from("presupuestos")
        .delete()
        .eq("id_solicitud", id);

      if (errorBorrado) {
        console.error("[PATCH /api/solicitudes/:id/estado]", errorBorrado);
        return Response.json(
          { error: "No se pudo revertir la carga." },
          { status: 400 },
        );
      }
    }

    const ahora = new Date().toISOString();
    const cambios: {
      estado: EstadoSolicitud;
      enviada_at?: string | null;
      resuelta_at?: string | null;
      resuelta_por?: string | null;
      referencia_aprobacion?: string | null;
      nota_resolucion?: string | null;
    } = { estado: destino };

    if (destino === "enviada" && actual === "borrador") cambios.enviada_at = ahora;
    if (destino === "aprobada" || destino === "rechazada") {
      cambios.resuelta_at = ahora;
      cambios.resuelta_por = auth.user.id;
    }
    if (destino === "borrador") {
      cambios.enviada_at = null;
      cambios.resuelta_at = null;
      cambios.resuelta_por = null;
    }
    if (cuerpo.referencia_aprobacion !== undefined) {
      cambios.referencia_aprobacion = cuerpo.referencia_aprobacion?.trim() || null;
    }
    if (cuerpo.nota_resolucion !== undefined) {
      cambios.nota_resolucion = cuerpo.nota_resolucion?.trim() || null;
    }

    const { error: errorUpdate } = await supabase
      .from("solicitudes")
      .update(cambios)
      .eq("id", id);

    if (errorUpdate) {
      console.error("[PATCH /api/solicitudes/:id/estado]", errorUpdate);
      return Response.json({ error: "No se pudo guardar el cambio de estado." }, { status: 400 });
    }

    return Response.json({ estado: destino });
  } catch (error) {
    console.error("[PATCH /api/solicitudes/:id/estado]", error);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
