import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EstadoSolicitud } from "@/types";

export const runtime = "nodejs";

interface Cuerpo {
  estado?: EstadoSolicitud;
  referencia_aprobacion?: string | null;
  nota_resolucion?: string | null;
}

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
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return Response.json({ error: "No autenticado" }, { status: 401 });

    const cuerpo = (await request.json()) as Cuerpo;
    const destino = cuerpo.estado;
    if (!destino) return Response.json({ error: "Falta el estado" }, { status: 400 });

    const { data: solicitud, error: errorLectura } = await supabase
      .from("solicitudes")
      .select("id, tipo, estado, id_oi, id_ceco, fy, trimestre, monto_solicitado")
      .eq("id", id)
      .maybeSingle();

    if (errorLectura) {
      return Response.json({ error: errorLectura.message }, { status: 400 });
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
      const { data: yaCargado } = await supabase
        .from("presupuestos")
        .select("id")
        .eq("id_solicitud", id)
        .limit(1);

      if ((yaCargado ?? []).length === 0) {
        const { data: lineas, error: errorLineas } = await supabase
          .from("solicitud_lineas")
          .select("mes, monto, cuenta_contable, descripcion_cuenta, tipo_gasto, detalle_gasto, responsable")
          .eq("id_solicitud", id);

        if (errorLineas) {
          return Response.json({ error: errorLineas.message }, { status: 400 });
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
            tipo: "extra_plan",
            fy: solicitud.fy,
            mes: l.mes,
            monto: l.monto,
            cuenta_contable: l.cuenta_contable,
            descripcion_cuenta: l.descripcion_cuenta,
            tipo_gasto: l.tipo_gasto,
            detalle_gasto: l.detalle_gasto,
            responsable: l.responsable,
            id_solicitud: id,
          })),
        );

        if (errorCarga) {
          return Response.json(
            { error: `No se pudo cargar al presupuesto: ${errorCarga.message}` },
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
        return Response.json(
          { error: `No se pudo revertir la carga: ${errorBorrado.message}` },
          { status: 400 },
        );
      }
    }

    const ahora = new Date().toISOString();
    const cambios: Record<string, string | null> = { estado: destino };

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
      return Response.json({ error: errorUpdate.message }, { status: 400 });
    }

    return Response.json({ estado: destino });
  } catch (error) {
    console.error("[PATCH /api/solicitudes/:id/estado]", error);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
