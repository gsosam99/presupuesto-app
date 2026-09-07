/**
 * Fetch compartido de Órdenes Internas activas.
 *
 * facturas/page.tsx, triaje/page.tsx y solicitudes/nueva/page.tsx arman cada
 * uno su propio selector de OI a partir de la misma tabla; acá se comparte
 * solo el fetch (mismas columnas, mismo filtro `activo`, mismo orden). Cada
 * página sigue filtrando por vigencia (ver vigencia.ts) y mapeando a su
 * propia forma de opción, porque esas dos partes sí difieren entre sí.
 */

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";

export interface OrdenInternaActiva {
  id: string;
  codigo_oi: string;
  nombre: string | null;
  tipo: "real" | "tag";
  id_ceco: string | null;
  id_hunting_zone: string | null;
  vigencia_desde: string | null;
  vigencia_hasta: string | null;
}

export async function obtenerOrdenesInternasActivas(
  supabase: SupabaseClient<Database>,
): Promise<{ data: OrdenInternaActiva[]; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from("ordenes_internas")
    .select(
      "id, codigo_oi, nombre, tipo, id_ceco, id_hunting_zone, vigencia_desde, vigencia_hasta",
    )
    .eq("activo", true)
    .order("codigo_oi");

  return { data: (data ?? []) as unknown as OrdenInternaActiva[], error };
}
