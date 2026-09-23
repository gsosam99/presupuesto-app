import { requireApiPermiso } from "@/lib/auth";
import { camposFacturaSchema, resolverDestino } from "@/lib/facturas/destino";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Edición de una factura pre-registrada, haya cruzado o no.
 *
 * La lógica vive en la función SQL actualizar_factura_preregistrada(): bloquea
 * la factura, rechaza cambios de número/proveedor si ya cruzó y propaga el
 * resto a sus posiciones SAP sin pisar correcciones hechas en el triaje. Todo
 * en una transacción, que es lo que no se puede garantizar desde acá.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const auth = await requireApiPermiso(supabase, "facturas:editar");
    if ("response" in auth) return auth.response;

    const parsed = camposFacturaSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 },
      );
    }
    const c = parsed.data;

    const destino = await resolverDestino(supabase, c.id_oi || null, c.id_ceco || null);
    if ("error" in destino) return Response.json({ error: destino.error }, { status: 400 });

    const { data, error } = await supabase.rpc("actualizar_factura_preregistrada", {
      p_id: id,
      p_cambios: {
        numero_factura: c.numero_factura,
        numero_orden: c.numero_orden ?? null,
        proveedor_codigo: c.proveedor_codigo ?? null,
        texto_referencia: c.texto_referencia ?? null,
        fecha_factura: c.fecha_factura || null,
        id_oi: c.id_oi || null,
        id_hunting_zone: destino.idHz,
        id_ceco: destino.idCeco,
        id_encargado: c.id_encargado || null,
        fase: c.fase ?? null,
        motivo: c.motivo ?? null,
        detalle: c.detalle ?? null,
        monto_estimado: c.monto_estimado ?? null,
        moneda: c.moneda ?? "USD",
        nota: c.nota ?? null,
      },
    });

    if (error) {
      console.error("[PATCH /api/facturas/:id]", error);
      // check_violation: el mensaje es para el usuario (llave de cruce bloqueada).
      if (error.code === "23514") return Response.json({ error: error.message }, { status: 409 });
      if (error.code === "P0002") {
        return Response.json({ error: "La factura no existe." }, { status: 404 });
      }
      return Response.json({ error: "No se pudo guardar la factura." }, { status: 400 });
    }

    return Response.json({ resultado: data });
  } catch (error) {
    console.error("[PATCH /api/facturas/:id]", error);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
