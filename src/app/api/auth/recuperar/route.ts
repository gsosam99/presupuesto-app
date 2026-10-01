import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { RUTA_INVITACION } from "@/lib/equipo/accesos";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

export const runtime = "nodejs";

const cuerpoSchema = z.object({ email: z.string().trim().email("Escribe un correo válido") });

/**
 * "Olvidé mi contraseña": Supabase envía un enlace que lleva a
 * /auth/invitacion, donde se elige la contraseña nueva.
 *
 * Se pide desde el servidor con flujo implícito y no desde el navegador: el
 * cliente del navegador usa PKCE, y ese enlace solo funciona en el MISMO
 * navegador que lo pidió (abrirlo desde el correo en el teléfono fallaría).
 *
 * Responde igual exista o no la cuenta, para no revelar qué correos tienen
 * acceso.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = cuerpoSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 },
      );
    }

    const supabase = createClient(supabaseUrl(), supabaseAnonKey(), {
      auth: { flowType: "implicit", autoRefreshToken: false, persistSession: false },
    });
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email.toLowerCase(), {
      redirectTo: `${new URL(request.url).origin}${RUTA_INVITACION}`,
    });

    if (error) {
      if (error.status === 429 || /rate limit|seconds/i.test(error.message)) {
        return Response.json(
          { error: "Se pidieron demasiados correos. Espera unos minutos e inténtalo de nuevo." },
          { status: 429 },
        );
      }
      console.error("[POST /api/auth/recuperar]", error.message);
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[POST /api/auth/recuperar]", error);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
