import { z } from "zod";

import { requireApiPermiso } from "@/lib/auth";
import { camposFacturaSchema, resolverDestino } from "@/lib/facturas/destino";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Alta manual de una factura pre-registrada (uso diario de finanzas). */
export async function POST(request: Request): Promise<Response> {
  try {
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
    const cuerpo = parsed.data;

    const destino = await resolverDestino(supabase, cuerpo.id_oi || null, cuerpo.id_ceco || null);
    if ("error" in destino) return Response.json({ error: destino.error }, { status: 400 });

    const { data, error } = await supabase
      .from("facturas_preregistradas")
      .insert({
        numero_factura: cuerpo.numero_factura,
        numero_orden: cuerpo.numero_orden?.trim() || null,
        id_encargado: cuerpo.id_encargado || null,
        proveedor_codigo: cuerpo.proveedor_codigo?.trim() || null,
        texto_referencia: cuerpo.texto_referencia?.trim() || null,
        fecha_factura: cuerpo.fecha_factura || null,
        id_oi: cuerpo.id_oi || null,
        id_ceco: destino.idCeco,
        id_hunting_zone: destino.idHz,
        fase: cuerpo.fase?.trim() || null,
        motivo: cuerpo.motivo?.trim() || null,
        detalle: cuerpo.detalle?.trim() || null,
        monto_estimado: cuerpo.monto_estimado ?? null,
        moneda: cuerpo.moneda ?? "USD",
        nota: cuerpo.nota?.trim() || null,
        creado_por: auth.user.id,
      })
      .select("id, numero_factura, numero_normalizado")
      .single();

    if (error) {
      console.error("[POST /api/facturas]", error);
      return Response.json({ error: "No se pudo registrar la factura." }, { status: 400 });
    }

    return Response.json({ factura: data }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/facturas]", error);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}

const borradoSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "No se indicó ninguna factura"),
});

/**
 * Borra facturas pre-registradas que todavía no cruzaron con SAP. Las
 * cruzadas se saltean (y se informan): para borrarlas primero hay que
 * deshacer el cruce, así ningún gasto queda apuntando a nada sin que nadie
 * lo haya decidido.
 */
export async function DELETE(request: Request): Promise<Response> {
  try {
    const supabase = await createSupabaseServerClient();
    const auth = await requireApiPermiso(supabase, "facturas:editar");
    if ("response" in auth) return auth.response;

    const parsed = borradoSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 },
      );
    }
    const { ids } = parsed.data;

    const { data: cruzadas, error: errorCruce } = await supabase
      .from("gastos")
      .select("id_factura_preregistrada")
      .in("id_factura_preregistrada", ids);

    if (errorCruce) {
      console.error("[DELETE /api/facturas]", errorCruce);
      return Response.json({ error: "No se pudo verificar el cruce." }, { status: 400 });
    }

    const conCruce = new Set((cruzadas ?? []).map((g) => g.id_factura_preregistrada as string));
    const borrables = ids.filter((id) => !conCruce.has(id));

    if (borrables.length === 0) {
      return Response.json(
        { error: "Las facturas elegidas ya cruzaron con SAP: deshaz el cruce antes de borrarlas." },
        { status: 409 },
      );
    }

    const { error } = await supabase.from("facturas_preregistradas").delete().in("id", borrables);

    if (error) {
      console.error("[DELETE /api/facturas]", error);
      return Response.json({ error: "No se pudieron borrar las facturas." }, { status: 400 });
    }

    return Response.json({ borradas: borrables.length, omitidas: conCruce.size });
  } catch (error) {
    console.error("[DELETE /api/facturas]", error);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
