import { z } from "zod";

import { requireApiUser } from "@/lib/auth";
import { resolverOiPorId } from "@/lib/presupuesto/resolverOi";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const cuerpoSchema = z.object({
  numero_factura: z.string().trim().min(1, "El número de factura es obligatorio"),
  proveedor_codigo: z.string().nullable().optional(),
  texto_referencia: z.string().nullable().optional(),
  fecha_factura: z.string().nullable().optional(),
  id_oi: z.string().nullable().optional(),
  id_ceco: z.string().nullable().optional(),
  id_hunting_zone: z.string().nullable().optional(),
  fase: z.string().nullable().optional(),
  motivo: z.string().nullable().optional(),
  detalle: z.string().nullable().optional(),
  monto_estimado: z.number().nullable().optional(),
  moneda: z.enum(["USD", "VES"]).optional(),
  nota: z.string().nullable().optional(),
});

/** Alta manual de una factura pre-registrada (uso diario de finanzas). */
export async function POST(request: Request): Promise<Response> {
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

    // La Hunting Zone la define siempre la Orden Interna (real o etiqueta), y
    // el CeCo se hereda del padre cuando la orden es real.
    let idHz = cuerpo.id_hunting_zone || null;
    let idCeco = cuerpo.id_ceco || null;

    if (cuerpo.id_oi) {
      const { data: oi, error: errorOi } = await resolverOiPorId(supabase, cuerpo.id_oi);

      if (errorOi) {
        console.error("[POST /api/facturas]", errorOi);
        return Response.json(
          { error: "No se pudo resolver la Orden Interna." },
          { status: 400 },
        );
      }

      if (oi?.id_hunting_zone) idHz = oi.id_hunting_zone;
      if (oi?.tipo === "real" && oi.id_ceco) idCeco = oi.id_ceco;
    }

    const { data, error } = await supabase
      .from("facturas_preregistradas")
      .insert({
        numero_factura: cuerpo.numero_factura,
        proveedor_codigo: cuerpo.proveedor_codigo?.trim() || null,
        texto_referencia: cuerpo.texto_referencia?.trim() || null,
        fecha_factura: cuerpo.fecha_factura || null,
        id_oi: cuerpo.id_oi || null,
        id_ceco: idCeco,
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
      console.error("[POST /api/facturas]", error);
      return Response.json({ error: "No se pudo registrar la factura." }, { status: 400 });
    }

    return Response.json({ factura: data }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/facturas]", error);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
