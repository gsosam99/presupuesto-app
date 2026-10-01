/**
 * Sugerencias de Motivo de un año fiscal: primero las macroactividades del
 * Plan (ordenadas por monto planificado), después los motivos ya usados en
 * ese año (por frecuencia). Así el Real se clasifica con el mismo vocabulario
 * del Plan y se puede comparar contra él.
 *
 * Lo leen el formulario de facturas (lib/facturas/opciones.ts) y la grilla de
 * triaje (lib/triaje/catalogos.ts). Fuente: v_sugerencias_motivo (schema §18).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { MotivoPlan } from "@/types";
import type { Database } from "@/types/supabase";

export interface SugerenciasMotivo {
  /** Todos los valores, en el orden en que se sugieren. */
  motivo: string[];
  /** Los que vienen del Plan, con las órdenes que los tienen planificados. */
  motivosPlan: MotivoPlan[];
  error: string | null;
}

interface FilaSugerencia {
  valor: string;
  origen: "plan" | "usado";
  id_oi: string | null;
  usos: number;
  monto: number | null;
}

export async function obtenerSugerenciasMotivo(
  supabase: SupabaseClient<Database>,
  fy: number,
): Promise<SugerenciasMotivo> {
  const { data, error } = await supabase
    .from("v_sugerencias_motivo")
    .select("valor, origen, id_oi, usos, monto")
    .eq("fy", fy);

  if (error) return { motivo: [], motivosPlan: [], error: error.message };

  const filas = (data ?? []) as unknown as FilaSugerencia[];

  // Una macroactividad puede estar planificada en varias OI: se agrupa.
  const plan = new Map<string, { monto: number; idsOi: Set<string> }>();
  const usados = new Map<string, number>();
  for (const f of filas) {
    if (f.origen === "plan") {
      const p = plan.get(f.valor) ?? { monto: 0, idsOi: new Set<string>() };
      p.monto += Number(f.monto ?? 0);
      if (f.id_oi) p.idsOi.add(f.id_oi);
      plan.set(f.valor, p);
    } else {
      usados.set(f.valor, (usados.get(f.valor) ?? 0) + f.usos);
    }
  }

  const motivosPlan: MotivoPlan[] = [...plan.entries()]
    .sort((a, b) => b[1].monto - a[1].monto)
    .map(([valor, p]) => ({ valor, idsOi: [...p.idsOi] }));

  const soloUsados = [...usados.entries()]
    .filter(([valor]) => !plan.has(valor))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
    .map(([valor]) => valor);

  return {
    motivo: [...motivosPlan.map((m) => m.valor), ...soloUsados],
    motivosPlan,
    error: null,
  };
}

/**
 * Ordena las sugerencias para una orden concreta: lo planificado en ESA orden
 * primero, después el resto del Plan y al final lo usado. Etiqueta lo del
 * Plan para que se distinga en el desplegable.
 */
export function motivosParaOrden(
  motivo: string[],
  motivosPlan: MotivoPlan[],
  idOi: string | null,
): { valores: string[]; etiquetas: Record<string, string> } {
  const etiquetas: Record<string, string> = {};
  const deLaOrden = new Set<string>();
  for (const m of motivosPlan) {
    const enOrden = idOi !== null && m.idsOi.includes(idOi);
    if (enOrden) deLaOrden.add(m.valor);
    etiquetas[m.valor] = enOrden ? "Plan de esta orden" : "Plan";
  }
  const valores = [
    ...motivo.filter((v) => deLaOrden.has(v)),
    ...motivo.filter((v) => !deLaOrden.has(v)),
  ];
  return { valores, etiquetas };
}
