import { z } from "zod";

import { requireApiUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const cuerpoSchema = z.object({
  fy: z.number().int().min(2015).max(2100),
  mes: z.number().int().min(1, "Elige el mes del ingreso").max(12),
  id_hunting_zone: z.string().uuid("Elige la Hunting Zone del ingreso"),
  monto: z
    .number()
    .refine((n) => Number.isFinite(n) && n !== 0, "El monto no puede ser cero"),
  concepto: z.string().trim().min(1, "El ingreso necesita un concepto"),
  fase: z.string().nullable().optional(),
  motivo: z.string().nullable().optional(),
  detalle: z.string().nullable().optional(),
  nota: z.string().nullable().optional(),
});

const parcheSchema = cuerpoSchema.partial().extend({
  id: z.string().uuid("Falta el id del ingreso"),
});

/** Los textos opcionales se guardan como null, nunca como cadena vacía. */
function limpiar(valor: string | null | undefined): string | null | undefined {
  if (valor === undefined) return undefined;
  return valor?.trim() || null;
}

/** Alta de un ingreso. */
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

    const { data: ingreso, error } = await supabase
      .from("ingresos")
      .insert({
        fy: cuerpo.fy,
        mes: cuerpo.mes,
        id_hunting_zone: cuerpo.id_hunting_zone,
        monto: cuerpo.monto,
        concepto: cuerpo.concepto.trim(),
        fase: limpiar(cuerpo.fase) ?? null,
        motivo: limpiar(cuerpo.motivo) ?? null,
        detalle: limpiar(cuerpo.detalle) ?? null,
        nota: limpiar(cuerpo.nota) ?? null,
        creado_por: auth.user.id,
      })
      .select("id")
      .single();

    if (error || !ingreso) {
      console.error("[POST /api/ingresos]", error);
      return Response.json({ error: "No se pudo registrar el ingreso." }, { status: 400 });
    }

    return Response.json({ id: ingreso.id }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/ingresos]", error);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}

/** Corrección de un ingreso ya cargado. Sólo viajan los campos que cambiaron. */
export async function PATCH(request: Request): Promise<Response> {
  try {
    const supabase = await createSupabaseServerClient();
    const auth = await requireApiUser(supabase);
    if ("response" in auth) return auth.response;

    const parsed = parcheSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 },
      );
    }
    const { id, ...resto } = parsed.data;

    // Objeto tipado en vez de un Record genérico: el cliente de Supabase
    // rechaza un índice `string` contra el Update de la tabla.
    const cambios: {
      fy?: number;
      mes?: number;
      id_hunting_zone?: string;
      monto?: number;
      concepto?: string;
      fase?: string | null;
      motivo?: string | null;
      detalle?: string | null;
      nota?: string | null;
    } = {};

    if (resto.fy !== undefined) cambios.fy = resto.fy;
    if (resto.mes !== undefined) cambios.mes = resto.mes;
    if (resto.id_hunting_zone !== undefined) cambios.id_hunting_zone = resto.id_hunting_zone;
    if (resto.monto !== undefined) cambios.monto = resto.monto;
    if (resto.concepto !== undefined) cambios.concepto = resto.concepto.trim();
    if (resto.fase !== undefined) cambios.fase = limpiar(resto.fase) ?? null;
    if (resto.motivo !== undefined) cambios.motivo = limpiar(resto.motivo) ?? null;
    if (resto.detalle !== undefined) cambios.detalle = limpiar(resto.detalle) ?? null;
    if (resto.nota !== undefined) cambios.nota = limpiar(resto.nota) ?? null;

    if (Object.keys(cambios).length === 0) {
      return Response.json({ error: "No hay cambios que aplicar" }, { status: 400 });
    }

    const { error } = await supabase.from("ingresos").update(cambios).eq("id", id);
    if (error) {
      console.error("[PATCH /api/ingresos]", error);
      return Response.json({ error: "No se pudo guardar el cambio." }, { status: 400 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[PATCH /api/ingresos]", error);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}

/**
 * Borra un ingreso. Es carga manual y nadie apunta a estas filas, así que un
 * ingreso mal tecleado se elimina en vez de arrastrarse: no hay ingesta que
 * volver a correr para corregirlo, y quedaría contaminando el dashboard para
 * siempre. Los gastos, en cambio, no se borran nunca — son data de SAP sellada
 * por el trigger tg_gastos_proteger_sap.
 */
export async function DELETE(request: Request): Promise<Response> {
  try {
    const supabase = await createSupabaseServerClient();
    const auth = await requireApiUser(supabase);
    if ("response" in auth) return auth.response;

    const id = new URL(request.url).searchParams.get("id");
    const parsed = z.string().uuid().safeParse(id);
    if (!parsed.success) {
      return Response.json({ error: "Falta el id del ingreso" }, { status: 400 });
    }

    const { error } = await supabase.from("ingresos").delete().eq("id", parsed.data);
    if (error) {
      console.error("[DELETE /api/ingresos]", error);
      return Response.json({ error: "No se pudo borrar el ingreso." }, { status: 400 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/ingresos]", error);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
