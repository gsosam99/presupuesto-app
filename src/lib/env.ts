/**
 * Acceso centralizado y validado a variables de entorno.
 *
 * La validación es PEREZOSA a propósito: si se lanza al evaluar el módulo, el
 * build de Next falla al recolectar la información de las rutas (`Failed to
 * collect page data`), porque en esa fase importa cada Route Handler sin tener
 * las variables de runtime. Validando dentro de la función, el build pasa y el
 * error aparece cuando realmente se necesita la credencial.
 *
 * IMPORTANTE: las variables NEXT_PUBLIC_ deben leerse con acceso ESTÁTICO
 * (process.env.NOMBRE_LITERAL). Next las sustituye textualmente en build time;
 * un acceso dinámico como process.env[nombre] no se reemplaza y llega
 * `undefined` al bundle del browser.
 */

function requerida(valor: string | undefined, nombre: string): string {
  if (!valor || valor.trim() === "") {
    throw new Error(
      `Variable de entorno requerida: ${nombre}. ` +
        `En local, copiá .env.local.example a .env.local; en Vercel, cargala en ` +
        `Project Settings > Environment Variables.`,
    );
  }
  return valor.trim();
}

/** URL pública del proyecto Supabase. Segura de exponer al browser. */
export function supabaseUrl(): string {
  return requerida(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");
}

/** Clave publishable/anon. Segura de exponer: el acceso real lo controla RLS. */
export function supabaseAnonKey(): string {
  return requerida(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  );
}
