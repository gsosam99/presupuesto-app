/**
 * Pre-registrado: facturas registradas en la app que SAP todavía no trajo.
 *
 * Es informativo: nunca se descuenta del Disponible (el gasto solo lo pone
 * SAP) y se cancela solo cuando la factura cruza. Ver v_preregistrado_mensual
 * en supabase/schema.sql (sección 17).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";

export interface Preregistrado {
  /** USD de facturas vigentes sin cruzar. */
  usd: number;
  facturasUsd: number;
  /** Facturas en Bs sin cruzar: no suman, no hay tasa confiable. */
  facturasBs: number;
  /** Más de 60 días sin cruzar: fuera del total, a revisar. */
  facturasVencidas: number;
  vencidasUsd: number;
}

/** Clave de unidad (id de OI o de CeCo) + mes calendario. */
export function clavePreregistrado(unidad: string, mes: number): string {
  return `${unidad}:${mes}`;
}

export async function obtenerPreregistrado(
  supabase: SupabaseClient<Database>,
  fy: number,
): Promise<{ data: Map<string, Preregistrado>; error: string | null }> {
  const { data, error } = await supabase
    .from("v_preregistrado_mensual")
    .select(
      "mes, id_oi, id_ceco, preregistrado_usd, facturas_usd, facturas_bs, facturas_vencidas, vencidas_usd",
    )
    .eq("fy", fy);

  const mapa = new Map<string, Preregistrado>();
  if (error) return { data: mapa, error: error.message };

  for (const f of data ?? []) {
    const unidad = (f.id_oi ?? f.id_ceco) as string | null;
    if (!unidad) continue;
    mapa.set(clavePreregistrado(unidad, Number(f.mes)), {
      usd: Number(f.preregistrado_usd),
      facturasUsd: Number(f.facturas_usd),
      facturasBs: Number(f.facturas_bs),
      facturasVencidas: Number(f.facturas_vencidas),
      vencidasUsd: Number(f.vencidas_usd),
    });
  }
  return { data: mapa, error: null };
}

/** Suma el pre-registrado de varios meses de una unidad. */
export function sumarPreregistrado(
  mapa: Map<string, Preregistrado>,
  unidad: string,
  meses: readonly number[],
): Preregistrado {
  const total: Preregistrado = {
    usd: 0,
    facturasUsd: 0,
    facturasBs: 0,
    facturasVencidas: 0,
    vencidasUsd: 0,
  };
  for (const mes of meses) {
    const p = mapa.get(clavePreregistrado(unidad, mes));
    if (!p) continue;
    total.usd += p.usd;
    total.facturasUsd += p.facturasUsd;
    total.facturasBs += p.facturasBs;
    total.facturasVencidas += p.facturasVencidas;
    total.vencidasUsd += p.vencidasUsd;
  }
  return total;
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
