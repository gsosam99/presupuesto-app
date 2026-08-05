import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface CuerpoAlta {
  numero_factura?: string;
  proveedor_codigo?: string | null;
  texto_referencia?: string | null;
  fecha_factura?: string | null;
  id_oi?: string | null;
  id_hunting_zone?: string | null;
  fase?: string | null;
  motivo?: string | null;
  detalle?: string | null;
  monto_estimado?: number | null;
  moneda?: "USD" | "VES";
  nota?: string | null;
}

/** Alta manual de una factura pre-registrada (uso diario de finanzas). */
export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return Response.json({ error: "No autenticado" }, { status: 401 });

    const cuerpo = (await request.json()) as CuerpoAlta;
    const numero = cuerpo.numero_factura?.trim();

    if (!numero) {
      return Response.json({ error: "El número de factura es obligatorio" }, { status: 400 });
    }

    // La Hunting Zone se deduce de la Orden Interna: la maestra es la verdad,
    // no lo que venga del formulario.
    let idHz = cuerpo.id_hunting_zone || null;
    if (cuerpo.id_oi) {
      const { data: oi } = await supabase
        .from("ordenes_internas")
        .select("id_hunting_zone")
        .eq("id", cuerpo.id_oi)
        .maybeSingle();
      if (oi?.id_hunting_zone) idHz = oi.id_hunting_zone as string;
    }

    const { data, error } = await supabase
      .from("facturas_preregistradas")
      .insert({
        numero_factura: numero,
        proveedor_codigo: cuerpo.proveedor_codigo?.trim() || null,
        texto_referencia: cuerpo.texto_referencia?.trim() || null,
        fecha_factura: cuerpo.fecha_factura || null,
        id_oi: cuerpo.id_oi || null,
        id_hunting_zone: idHz,
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
      return Response.json({ error: error.message }, { status: 400 });
    }

    return Response.json({ factura: data }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/facturas]", error);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
