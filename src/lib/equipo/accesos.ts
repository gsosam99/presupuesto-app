/**
 * Puente entre la maestra de Equipo (miembros_equipo) y Supabase Auth.
 *
 * El rol se resuelve por correo (rol_actual() en schema.sql), así que dar
 * acceso a alguien es: fila en miembros_equipo con rol + cuenta en Auth con
 * ese mismo correo. Acá se crea esa cuenta (invitación) y se consulta su
 * estado, para no tener que entrar al dashboard de Supabase.
 *
 * Solo servidor: usa el cliente con la clave secreta.
 */

import type { User } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AccesoMiembro } from "@/types";

/** Ruta donde la persona invitada elige su contraseña. */
export const RUTA_INVITACION = "/auth/invitacion";

function estadoDe(usuario: User | undefined): AccesoMiembro {
  if (!usuario) return { estado: "sin_cuenta", ultimoIngreso: null, invitadoEl: null };
  return {
    // Una cuenta invitada que nunca entró no tiene last_sign_in_at.
    estado: usuario.last_sign_in_at ? "activo" : "invitado",
    ultimoIngreso: usuario.last_sign_in_at ?? null,
    invitadoEl: usuario.invited_at ?? null,
  };
}

/** Cuentas de Auth por correo (en minúsculas). El equipo es chico: se listan todas. */
async function cuentasPorCorreo(): Promise<Map<string, User>> {
  const admin = createSupabaseAdminClient();
  const porCorreo = new Map<string, User>();
  for (let pagina = 1; ; pagina += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 1000 });
    if (error) throw new Error(`Leyendo usuarios de Auth: ${error.message}`);
    for (const u of data.users) {
      if (u.email) porCorreo.set(u.email.toLowerCase(), u);
    }
    if (data.users.length < 1000) break;
  }
  return porCorreo;
}

/** Estado de acceso de cada correo dado. */
export async function obtenerAccesos(correos: string[]): Promise<Record<string, AccesoMiembro>> {
  const cuentas = await cuentasPorCorreo();
  return Object.fromEntries(
    correos.map((c) => [c.toLowerCase(), estadoDe(cuentas.get(c.toLowerCase()))]),
  );
}

export type ResultadoInvitacion = { ok: true; enlace?: string } | { ok: false; error: string };

/**
 * Invita por correo (lo envía Supabase) o, con `soloEnlace`, devuelve el
 * enlace para mandarlo por otro medio. Si la persona ya entró alguna vez no
 * hace falta invitarla: tiene cuenta y su rol aplica al iniciar sesión.
 */
export async function invitar(
  correo: string,
  origen: string,
  soloEnlace = false,
): Promise<ResultadoInvitacion> {
  const admin = createSupabaseAdminClient();
  const email = correo.trim().toLowerCase();
  const redirectTo = `${origen}${RUTA_INVITACION}`;

  const existente = (await cuentasPorCorreo()).get(email);
  if (existente?.last_sign_in_at) {
    return {
      ok: false,
      error: "Esta persona ya tiene cuenta y entró a la app: no hace falta invitarla.",
    };
  }

  if (soloEnlace) {
    // Sin cuenta: enlace de invitación (crea la cuenta). Con cuenta invitada
    // que nunca entró: enlace mágico, que la deja elegir contraseña igual.
    const { data, error } = await admin.auth.admin.generateLink(
      existente
        ? { type: "magiclink", email, options: { redirectTo } }
        : { type: "invite", email, options: { redirectTo } },
    );
    if (error) return { ok: false, error: `No se pudo generar el enlace: ${error.message}` };
    return { ok: true, enlace: data.properties.action_link };
  }

  // Re-invitar a una cuenta que todavía no confirmó reenvía el correo.
  const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (error) {
    const limite = error.status === 429 || /rate limit/i.test(error.message);
    return {
      ok: false,
      error: limite
        ? "Supabase alcanzó el límite de correos por hora. Usa “Copiar enlace” y envíalo tú."
        : `No se pudo enviar la invitación: ${error.message}`,
    };
  }
  return { ok: true };
}
