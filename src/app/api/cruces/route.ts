import { z } from "zod";

import { requireApiPermiso } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const cuerpoSchema = z
  .object({
    /** Deshace el cruce de estos gastos (asistente, paso 3). */
    ids_gasto: z.array(z.string().uuid()).optional(),
    /** Deshace el cruce de todas las posiciones de una factura (tabla de facturas). */
    id_factura: z.string().uuid().optional(),
  })
  .refine((c) => (c.ids_gasto?.length ?? 0) > 0 || c.id_factura, {
    message: "Indica los gastos o la factura",
  });

/**
 * Deshace cruces factura ↔ gasto. La regla (qué se limpia y qué se conserva)
 * vive en la función SQL deshacer_cruce().
 */
export async function DELETE(request: Request): Promise<Response> {
  try {
    const supabase = await createSupabaseServerClient();
    const auth = await requireApiPermiso(supabase, "triaje:editar");
    if ("response" in auth) return auth.response;

    const parsed = cuerpoSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 },
      );
    }

    let ids = parsed.data.ids_gasto ?? [];
    if (parsed.data.id_factura) {
      const { data, error } = await supabase
        .from("gastos")
        .select("id")
        .eq("id_factura_preregistrada", parsed.data.id_factura);
      if (error) {
        console.error("[DELETE /api/cruces]", error);
        return Response.json({ error: "No se pudieron leer los gastos." }, { status: 400 });
      }
      ids = [...ids, ...(data ?? []).map((g) => g.id)];
    }

    if (ids.length === 0) return Response.json({ deshechos: 0 });

    const { data, error } = await supabase.rpc("deshacer_cruce", { p_ids_gasto: ids });
    if (error) {
      console.error("[DELETE /api/cruces]", error);
      return Response.json({ error: "No se pudo deshacer el cruce." }, { status: 400 });
    }

    return Response.json({ deshechos: Number(data ?? 0) });
  } catch (error) {
    console.error("[DELETE /api/cruces]", error);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
