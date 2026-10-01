import { z } from "zod";

import { requireApiPermiso } from "@/lib/auth";
import { invitar } from "@/lib/equipo/accesos";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const cuerpoSchema = z.object({
  id: z.string().uuid("Falta el miembro del equipo"),
  /** true = devolver el enlace en vez de mandar el correo. */
  soloEnlace: z.boolean().optional(),
});

/**
 * Invita a un miembro del equipo: crea su cuenta en Supabase Auth con el
 * correo de la maestra. El correo se lee de la base, no del cliente.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await createSupabaseServerClient();
    const auth = await requireApiPermiso(supabase, "equipo:editar");
    if ("response" in auth) return auth.response;

    const parsed = cuerpoSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 },
      );
    }

    const { data: miembro, error } = await supabase
      .from("miembros_equipo")
      .select("correo, rol, activo")
      .eq("id", parsed.data.id)
      .maybeSingle();

    if (error) {
      console.error("[POST /api/equipo/invitar]", error);
      return Response.json({ error: "No se pudo leer el miembro." }, { status: 400 });
    }
    if (!miembro) return Response.json({ error: "El miembro no existe." }, { status: 404 });
    if (!miembro.correo) {
      return Response.json({ error: "El miembro no tiene correo." }, { status: 400 });
    }
    if (!miembro.rol || !miembro.activo) {
      return Response.json(
        { error: "Asígnale un rol y déjalo activo antes de invitarlo: sin rol no entra a la app." },
        { status: 400 },
      );
    }

    const origen = new URL(request.url).origin;
    const resultado = await invitar(miembro.correo, origen, parsed.data.soloEnlace ?? false);
    if (!resultado.ok) return Response.json({ error: resultado.error }, { status: 400 });

    return Response.json({ ok: true, enlace: resultado.enlace ?? null });
  } catch (error) {
    console.error("[POST /api/equipo/invitar]", error);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
