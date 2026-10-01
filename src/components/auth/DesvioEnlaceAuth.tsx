"use client";

import { useEffect } from "react";

import { RUTA_INVITACION } from "@/lib/equipo/rutas";

/** Tipos de enlace de Supabase que terminan en "elige tu contraseña". */
const TIPOS = new Set(["invite", "recovery", "magiclink", "signup"]);

/**
 * Los enlaces de invitación y de "olvidé mi contraseña" traen la sesión en el
 * fragmento (#access_token=…&type=invite). Deberían llegar a /auth/invitacion,
 * pero si esa URL no está en la lista de Redirect URLs de Supabase, Supabase
 * manda al Site URL: "/" → /dashboard → /login, y ahí nadie lee el fragmento
 * (el navegador lo conserva en cada redirección). Esto lo detecta en cualquier
 * página y lo lleva a elegir la contraseña con el fragmento intacto.
 *
 * Vive en el layout raíz y no dibuja nada.
 */
export function DesvioEnlaceAuth() {
  useEffect(() => {
    if (window.location.pathname === RUTA_INVITACION) return;
    const fragmento = new URLSearchParams(window.location.hash.slice(1));
    const conSesion = fragmento.has("access_token") && TIPOS.has(fragmento.get("type") ?? "");
    // Un enlace vencido trae el error en el fragmento: la página de la
    // invitación sabe explicarlo y ofrecer qué hacer.
    const conError = fragmento.has("error_description");
    if (conSesion || conError) {
      window.location.replace(`${RUTA_INVITACION}${window.location.hash}`);
    }
  }, []);

  return null;
}
