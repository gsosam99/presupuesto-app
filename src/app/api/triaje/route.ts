import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Accion = "guardar" | "archivar" | "reabrir";

interface Cuerpo {
  ids?: string[];
  accion?: Accion;
  /** Código de Orden Interna o etiqueta (#CAM). Se resuelve en el servidor. */
  asignacion?: string | null;
  id_hunting_zone?: string | null;
  fase?: string | null;
  motivo?: string | null;
  detalle?: string | null;
  nota?: string | null;
  id_factura_preregistrada?: string | null;
  /** Si es false, guarda los cambios pero deja el gasto pendiente. */
  aprobar?: boolean;
}

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
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return Response.json({ error: "No autenticado" }, { status: 401 });

    const cuerpo = (await request.json()) as Cuerpo;
    const ids = (cuerpo.ids ?? []).filter((id) => typeof id === "string" && id !== "");
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

      if (error) return Response.json({ error: error.message }, { status: 400 });
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
          .ilike("tag", asignacion)
          .eq("activo", true)
          .maybeSingle();

        if (error) return Response.json({ error: error.message }, { status: 400 });
        if (!fila) {
          return Response.json(
            { error: `La etiqueta "${asignacion}" no existe.` },
            { status: 400 },
          );
        }
        idHz = fila.id_hunting_zone as string;
        cambios.origen_hz = "manual";
      } else {
        // Orden Interna: además de la HZ, arrastra el CeCo de la maestra.
        const { data: oi, error } = await supabase
          .from("ordenes_internas")
          .select("id, id_ceco, id_hunting_zone")
          .ilike("codigo_oi", asignacion)
          .maybeSingle();

        if (error) return Response.json({ error: error.message }, { status: 400 });
        if (!oi) {
          return Response.json(
            { error: `La Orden Interna "${asignacion}" no existe en la maestra.` },
            { status: 400 },
          );
        }
        idOi = oi.id as string;
        cambios.id_oi = idOi;
        if (oi.id_ceco) cambios.id_ceco = oi.id_ceco as string;
        if (!idHz && oi.id_hunting_zone) {
          idHz = oi.id_hunting_zone as string;
          cambios.origen_hz = "orden_interna";
        }
      }
    } else if (idHz) {
      cambios.origen_hz = "manual";
    }

    // Asociación manual con una factura pre-registrada: hereda su destino.
    if (cuerpo.id_factura_preregistrada) {
      const { data: factura, error } = await supabase
        .from("facturas_preregistradas")
        .select("id, id_oi, id_hunting_zone, fase, motivo, detalle")
        .eq("id", cuerpo.id_factura_preregistrada)
        .maybeSingle();

      if (error) return Response.json({ error: error.message }, { status: 400 });
      if (!factura) return Response.json({ error: "La factura no existe" }, { status: 400 });

      cambios.id_factura_preregistrada = factura.id as string;
      if (!idOi && factura.id_oi) cambios.id_oi = factura.id_oi as string;
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

      if (error) return Response.json({ error: error.message }, { status: 400 });
      if ((sinHz ?? []).length > 0) {
        return Response.json(
          {
            error:
              "Falta el proyecto: escribí una Orden Interna, una etiqueta (#CAM) o asociá una factura pre-registrada.",
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
      return Response.json({ error: errorUpdate.message }, { status: 400 });
    }

    return Response.json({ actualizados: ids.length, accion: "guardar", aprobado: aprobar });
  } catch (error) {
    console.error("[PATCH /api/triaje]", error);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
