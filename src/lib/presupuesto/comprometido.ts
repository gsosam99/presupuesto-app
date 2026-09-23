/**
 * Capa "comprometido": facturas pre-registradas que SAP todavía no trajo.
 *
 * Nunca se mezcla con el consumido, que solo lo pone SAP: se muestra aparte y
 * se cancela sola cuando la factura cruza. Ver v_comprometido_trimestre en
 * supabase/schema.sql (sección 15.3).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";

export interface Comprometido {
  /** USD de facturas vigentes sin cruzar. */
  usd: number;
  facturasUsd: number;
  /** Facturas en Bs sin cruzar: no suman, no hay tasa confiable. */
  facturasBs: number;
  /** Más de 60 días sin cruzar: fuera del comprometido, a revisar. */
  facturasVencidas: number;
  vencidasUsd: number;
}

/** Clave de unidad + trimestre, la misma que usa Fondos. */
export function claveComprometido(unidad: string, trimestre: number): string {
  return `${unidad}:${trimestre}`;
}

export async function obtenerComprometido(
  supabase: SupabaseClient<Database>,
  fy: number,
): Promise<{ data: Map<string, Comprometido>; error: string | null }> {
  const { data, error } = await supabase
    .from("v_comprometido_trimestre")
    .select(
      "trimestre, id_oi, id_ceco, comprometido_usd, facturas_usd, facturas_bs, facturas_vencidas, vencidas_usd",
    )
    .eq("fy", fy);

  const mapa = new Map<string, Comprometido>();
  if (error) return { data: mapa, error: error.message };

  for (const f of data ?? []) {
    const unidad = (f.id_oi ?? f.id_ceco) as string | null;
    if (!unidad) continue;
    mapa.set(claveComprometido(unidad, Number(f.trimestre)), {
      usd: Number(f.comprometido_usd),
      facturasUsd: Number(f.facturas_usd),
      facturasBs: Number(f.facturas_bs),
      facturasVencidas: Number(f.facturas_vencidas),
      vencidasUsd: Number(f.vencidas_usd),
    });
  }
  return { data: mapa, error: null };
}

/** Fecha de la última carga de SAP completada: "los datos de SAP son al…". */
export async function obtenerFechaDatosSap(
  supabase: SupabaseClient<Database>,
): Promise<string | null> {
  const { data } = await supabase
    .from("cargas")
    .select("finalizada_at")
    .in("tipo", ["sap_ceco", "sap_oi"])
    .eq("estado", "completada")
    .order("finalizada_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return data?.finalizada_at ?? null;
}
