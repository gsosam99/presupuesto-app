/**
 * Resolución de Orden Interna: la Hunting Zone y el CeCo de un gasto/factura
 * SIEMPRE se heredan de su Orden Interna (real o etiqueta), nunca del cliente.
 *
 * facturas/route.ts busca por `id` (el formulario ya trae el id elegido);
 * triaje/route.ts busca por `codigo_oi` (el usuario escribe el código). Son
 * lookups distintos, así que se exponen como dos funciones finas que
 * comparten solo la forma del resultado — qué hacer con `tipo`/`id_ceco`/
 * `id_hunting_zone` sigue siendo decisión de cada route, porque difiere
 * (alta de factura vs. actualización masiva de gastos con `origen_hz`).
 */

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";

export interface OiResuelta {
  id: string;
  tipo: "real" | "tag";
  id_ceco: string | null;
  id_hunting_zone: string | null;
}

/**
 * Escapa `%` y `_` para usar un valor de usuario como patrón exacto de
 * `.ilike()` sin que actúen como comodines. Los códigos de OI y las
 * etiquetas se matchean sin distinguir mayúsculas (así se cargan hoy desde
 * Excel/SAP), así que la búsqueda exacta se hace con `.ilike()` + escape en
 * vez de `.eq()`, que sería sensible a mayúsculas.
 */
export function escaparPatronIlike(valor: string): string {
  return valor.replace(/[%_\\]/g, (c) => `\\${c}`);
}

/** Busca una Orden Interna por id. */
export async function resolverOiPorId(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<{ data: Omit<OiResuelta, "id"> | null; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from("ordenes_internas")
    .select("tipo, id_ceco, id_hunting_zone")
    .eq("id", id)
    .maybeSingle();

  return { data: data as Omit<OiResuelta, "id"> | null, error };
}

/** Busca una Orden Interna por código exacto (real o etiqueta), sin distinguir mayúsculas. */
export async function resolverOiPorCodigo(
  supabase: SupabaseClient<Database>,
  codigo: string,
): Promise<{ data: OiResuelta | null; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from("ordenes_internas")
    .select("id, tipo, id_ceco, id_hunting_zone")
    .ilike("codigo_oi", escaparPatronIlike(codigo))
    .maybeSingle();

  return { data: data as OiResuelta | null, error };
}
