import { z } from "zod";

import { requireApiUser } from "@/lib/auth";
import { escaparPatronIlike, resolverOiPorCodigo } from "@/lib/presupuesto/resolverOi";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Accion = "guardar" | "archivar" | "reabrir";

const cuerpoSchema = z.object({
  ids: z.array(z.string()).optional(),
  accion: z.enum(["guardar", "archivar", "reabrir"]).optional(),
  /** Código de Orden Interna o etiqueta (#CAM). Se resuelve en el servidor. */
  asignacion: z.string().nullable().optional(),
  id_hunting_zone: z.string().nullable().optional(),
  fase: z.string().nullable().optional(),
  motivo: z.string().nullable().optional(),
  detalle: z.string().nullable().optional(),
  nota: z.string().nullable().optional(),
  id_factura_preregistrada: z.string().nullable().optional(),
  /** Si es false, guarda los cambios pero deja el gasto pendiente. */
  aprobar: z.boolean().optional(),
});

function limpiar(valor: string | null | undefined): string | null {
  const v = valor?.trim();
  return v ? v : null;
}

/**
 * Sala de Triaje: completa la información faltante de uno o varios gastos.
 *
 * La asignación acepta tanto un código de Orden Interna como una etiqueta de
 * Hunting Zone, y SIEMPRE se resuelve en el servidor contra las maestras: el
 * cliente no decide a qué proyecto corresponde nada.
 */
export async function PATCH(request: Request): Promise<Response> {
  try {
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

    const ids = (cuerpo.ids ?? []).filter((id) => id !== "");
    const accion: Accion = cuerpo.accion ?? "guardar";

    if (ids.length === 0) {
      return Response.json({ error: "No se indicó ningún gasto" }, { status: 400 });
    }

    const sello = {
      revisado_por: auth.user.id,
      revisado_at: new Date().toISOString(),
    };

    // --- Archivar / reabrir --------------------------------------------------
    if (accion === "archivar" || accion === "reabrir") {
      const { error } = await supabase
        .from("gastos")
        .update({
          estado_revision: accion === "archivar" ? "excluido" : "pendiente",
          ...sello,
        })
        .in("id", ids);

      if (error) {
        console.error("[PATCH /api/triaje]", error);
        return Response.json({ error: "No se pudo actualizar el gasto." }, { status: 400 });
      }
      return Response.json({ actualizados: ids.length, accion });
    }

    // --- Guardar -------------------------------------------------------------
    const cambios: Record<string, string | null> = {};
    let idHz = limpiar(cuerpo.id_hunting_zone);
    let idOi: string | null = null;

    const asignacion = limpiar(cuerpo.asignacion);
    if (asignacion) {
      if (asignacion.startsWith("#")) {
        // Etiqueta de Hunting Zone: para gastos que vinieron con CeCo y sin OI.
        const { data: fila, error } = await supabase
          .from("hunting_zone_tags")
          .select("id_hunting_zone")
          .ilike("tag", escaparPatronIlike(asignacion))
          .eq("activo", true)
          .maybeSingle();

        if (error) {
          console.error("[PATCH /api/triaje]", error);
          return Response.json({ error: "No se pudo resolver la etiqueta." }, { status: 400 });
        }
        if (!fila) {
          return Response.json(
            { error: `La etiqueta "${asignacion}" no existe.` },
            { status: 400 },
          );
        }
        idHz = fila.id_hunting_zone as string;
        cambios.origen_hz = "manual";
      } else {
        // Orden Interna: real o tag. La OI es la que define la Hunting Zone.
        // Si es real, además arrastra su CeCo padre; si es un tag, el CeCo que
        // trajo SAP se conserva intacto (el tag solo aporta la HZ).
        const { data: oi, error } = await resolverOiPorCodigo(supabase, asignacion);

        if (error) {
          console.error("[PATCH /api/triaje]", error);
          return Response.json(
            { error: "No se pudo resolver la Orden Interna." },
            { status: 400 },
          );
        }
        if (!oi) {
          return Response.json(
            {
              error: `"${asignacion}" no existe en la maestra de órdenes internas (ni como orden real ni como etiqueta).`,
            },
            { status: 400 },
          );
        }

        idOi = oi.id;
        cambios.id_oi = idOi;
        if (oi.tipo === "real" && oi.id_ceco) {
          cambios.id_ceco = oi.id_ceco;
        }
        if (!idHz && oi.id_hunting_zone) {
          idHz = oi.id_hunting_zone;
          cambios.origen_hz = oi.tipo === "real" ? "orden_interna" : "manual";
        }
      }
    } else if (idHz) {
      cambios.origen_hz = "manual";
    }

    // Asociación manual con una factura pre-registrada: hereda su destino.
    if (cuerpo.id_factura_preregistrada) {
      const { data: factura, error } = await supabase
        .from("facturas_preregistradas")
        .select("id, id_oi, id_ceco, id_hunting_zone, fase, motivo, detalle")
        .eq("id", cuerpo.id_factura_preregistrada)
        .maybeSingle();

      if (error) {
        console.error("[PATCH /api/triaje]", error);
        return Response.json(
          { error: "No se pudo resolver la factura pre-registrada." },
          { status: 400 },
        );
      }
      if (!factura) return Response.json({ error: "La factura no existe" }, { status: 400 });

      cambios.id_factura_preregistrada = factura.id as string;
      if (!idOi && factura.id_oi) cambios.id_oi = factura.id_oi as string;
      if (factura.id_ceco) cambios.id_ceco = factura.id_ceco as string;
      if (!idHz && factura.id_hunting_zone) {
        idHz = factura.id_hunting_zone as string;
        cambios.origen_hz = "prerregistro";
      }
      // La taxonomía explícita del formulario tiene prioridad sobre la heredada.
      if (!limpiar(cuerpo.fase) && factura.fase) cambios.fase = factura.fase as string;
      if (!limpiar(cuerpo.motivo) && factura.motivo) cambios.motivo = factura.motivo as string;
      if (!limpiar(cuerpo.detalle) && factura.detalle) {
        cambios.detalle = factura.detalle as string;
      }
    }

    if (idHz) cambios.id_hunting_zone = idHz;
    if (limpiar(cuerpo.fase)) cambios.fase = limpiar(cuerpo.fase);
    if (limpiar(cuerpo.motivo)) cambios.motivo = limpiar(cuerpo.motivo);
    if (limpiar(cuerpo.detalle)) cambios.detalle = limpiar(cuerpo.detalle);
    if (cuerpo.nota !== undefined) cambios.nota = limpiar(cuerpo.nota);

    const aprobar = cuerpo.aprobar !== false;

    // Aprobar sin Hunting Zone dejaría un gasto sin proyecto contando en los KPIs.
    if (aprobar && !idHz) {
      const { data: sinHz, error } = await supabase
        .from("gastos")
        .select("id")
        .in("id", ids)
        .is("id_hunting_zone", null);

      if (error) {
        console.error("[PATCH /api/triaje]", error);
        return Response.json(
          { error: "No se pudo verificar el estado de los gastos." },
          { status: 400 },
        );
      }
      if ((sinHz ?? []).length > 0) {
        return Response.json(
          {
            error:
              "Falta el proyecto: escribe la Orden Interna real, una etiqueta (#CAM) o asocia una factura pre-registrada.",
          },
          { status: 400 },
        );
      }
    }

    const { error: errorUpdate } = await supabase
      .from("gastos")
      .update({
        ...cambios,
        ...(aprobar ? { estado_revision: "aprobado" } : {}),
        ...sello,
      })
      .in("id", ids);

    if (errorUpdate) {
      console.error("[PATCH /api/triaje]", errorUpdate);
      return Response.json({ error: "No se pudo guardar los cambios." }, { status: 400 });
    }

    return Response.json({ actualizados: ids.length, accion: "guardar", aprobado: aprobar });
  } catch (error) {
    console.error("[PATCH /api/triaje]", error);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
