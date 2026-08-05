/**
 * Acceso centralizado y validado a variables de entorno.
 * Falla en el arranque (no en runtime del usuario) si falta algo crítico.
 */

/**
 * IMPORTANTE: las variables NEXT_PUBLIC_ deben leerse con acceso ESTÁTICO
 * (process.env.NOMBRE_LITERAL). Next las reemplaza en build time por su valor;
 * un acceso dinámico como process.env[nombre] no se sustituye y llega
 * `undefined` al bundle del browser.
 */
function requerida(valor: string | undefined, nombre: string): string {
  if (!valor || valor.trim() === "") {
    throw new Error(
      `Variable de entorno requerida: ${nombre}. Copiá .env.local.example a .env.local y completala.`,
    );
  }
  return valor.trim();
}

/** URL pública del proyecto Supabase. Segura de exponer al browser. */
export const SUPABASE_URL = requerida(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  "NEXT_PUBLIC_SUPABASE_URL",
);

/** Clave publishable/anon. Segura de exponer: el acceso real lo controla RLS. */
export const SUPABASE_ANON_KEY = requerida(
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
);
