/**
 * Lectura de la disponibilidad trimestral.
 *
 * La regla de negocio vive en la función SQL disponibilidad_trimestral():
 * acá sólo se consulta y se agrupa para las pantallas.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { DisponibilidadTrimestre } from "@/types";
import type { Database } from "@/types/supabase";

export async function obtenerDisponibilidad(
  supabase: SupabaseClient<Database>,
  fy: number,
): Promise<DisponibilidadTrimestre[]> {
  const { data, error } = await supabase.rpc("disponibilidad_trimestral", { p_fy: fy });
  if (error) throw new Error(`Disponibilidad: ${error.message}`);

  return ((data ?? []) as unknown as DisponibilidadTrimestre[]).map((d) => ({
    ...d,
    monto_plan: Number(d.monto_plan),
    monto_extra: Number(d.monto_extra),
    arrastre_recibido: Number(d.arrastre_recibido),
    disponible: Number(d.disponible),
    consumido: Number(d.consumido),
    saldo: Number(d.saldo),
    arrastre_siguiente: Number(d.arrastre_siguiente),
    vencido: Number(d.vencido),
  }));
}

export interface UnidadPresupuestaria {
  clave: string;
  idOi: string | null;
  codigo: string;
  huntingZone: string | null;
  trimestres: DisponibilidadTrimestre[];
  planAnual: number;
  consumidoAnual: number;
  vencidoAnual: number;
  /** Saldo del trimestre en curso: lo que realmente hay para gastar hoy. */
  saldoActual: number;
  /** Lo que se habilita en los trimestres que todavía no empezaron. */
  porHabilitar: number;
}

/** Agrupa las filas por unidad presupuestaria para las tarjetas de la UI. */
export function agruparPorUnidad(
  filas: DisponibilidadTrimestre[],
): UnidadPresupuestaria[] {
  const mapa = new Map<string, UnidadPresupuestaria>();

  for (const f of filas) {
    const previo = mapa.get(f.clave) ?? {
      clave: f.clave,
      idOi: f.id_oi,
      codigo: f.codigo_oi ?? f.codigo_ceco ?? "—",
      huntingZone: f.hunting_zone,
      trimestres: [],
      planAnual: 0,
      consumidoAnual: 0,
      vencidoAnual: 0,
      saldoActual: 0,
      porHabilitar: 0,
    };

    previo.trimestres.push(f);
    previo.planAnual += f.monto_plan + f.monto_extra;
    previo.consumidoAnual += f.consumido;
    previo.vencidoAnual += f.vencido;
    if (f.estado_trimestre === "actual") previo.saldoActual += f.saldo;
    if (f.estado_trimestre === "futuro") {
      previo.porHabilitar += f.monto_plan + f.monto_extra;
    }

    mapa.set(f.clave, previo);
  }

  for (const u of mapa.values()) {
    u.trimestres.sort((a, b) => a.trimestre - b.trimestre);
  }

  return [...mapa.values()].sort((a, b) => b.planAnual - a.planAnual);
}
