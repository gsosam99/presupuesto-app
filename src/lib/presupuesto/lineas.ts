/**
 * Líneas de presupuesto de un año fiscal, tal como se cargaron (Plan y Extra
 * Plan), con su orden o CeCo resueltos para mostrar. Es la fuente de la página
 * Presupuestos: el resumen por mes y el detalle auditable salen de acá.
 *
 * No se usa v_presupuesto_oi_mes: esa vista cruza solo con órdenes internas y
 * dejaría fuera las líneas presupuestadas directo a un Centro de Costo.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";
import type { TipoPresupuesto } from "@/types";

export interface LineaPresupuesto {
  id: string;
  tipo: TipoPresupuesto;
  mes: number;
  monto: number;
  cuenta: string | null;
  descripcionCuenta: string | null;
  detalle: string | null;
  tipoGasto: string | null;
  macroactividad: string | null;
  responsable: string | null;
  /** id de la OI o del CeCo: agrupa las líneas por unidad. */
  claveUnidad: string;
  tipoUnidad: "oi" | "ceco";
  codigoUnidad: string;
  nombreUnidad: string | null;
  huntingZone: string | null;
}

interface FilaPresupuesto {
  id: string;
  tipo: TipoPresupuesto;
  mes: number;
  monto: number;
  cuenta_contable: string | null;
  descripcion_cuenta: string | null;
  detalle_gasto: string | null;
  tipo_gasto: string | null;
  macroactividad: string | null;
  responsable: string | null;
  id_oi: string | null;
  id_ceco: string | null;
}

const PASO = 1000;

export async function obtenerLineasPresupuesto(
  supabase: SupabaseClient<Database>,
  fy: number,
): Promise<{ data: LineaPresupuesto[]; error: string | null }> {
  const filas: FilaPresupuesto[] = [];
  for (let i = 0; ; i += PASO) {
    const { data, error } = await supabase
      .from("presupuestos")
      .select(
        "id, tipo, mes, monto, cuenta_contable, descripcion_cuenta, detalle_gasto, tipo_gasto, macroactividad, responsable, id_oi, id_ceco",
      )
      .eq("fy", fy)
      .order("id")
      .range(i, i + PASO - 1);
    if (error) return { data: [], error: error.message };
    const pagina = (data ?? []) as unknown as FilaPresupuesto[];
    filas.push(...pagina);
    if (pagina.length < PASO) break;
  }

  if (filas.length === 0) return { data: [], error: null };

  const [ois, cecos, hzs] = await Promise.all([
    supabase.from("ordenes_internas").select("id, codigo_oi, nombre, id_hunting_zone"),
    supabase.from("cecos").select("id, codigo_sap, nombre"),
    supabase.from("hunting_zones").select("id, nombre"),
  ]);
  const error = ois.error ?? cecos.error ?? hzs.error;
  if (error) return { data: [], error: error.message };

  const hzPorId = new Map((hzs.data ?? []).map((h) => [h.id as string, h.nombre as string]));
  const oiPorId = new Map((ois.data ?? []).map((o) => [o.id as string, o]));
  const cecoPorId = new Map((cecos.data ?? []).map((c) => [c.id as string, c]));

  return {
    data: filas.map((f) => {
      const oi = f.id_oi ? oiPorId.get(f.id_oi) : undefined;
      const ceco = f.id_ceco ? cecoPorId.get(f.id_ceco) : undefined;
      return {
        id: f.id,
        tipo: f.tipo,
        mes: Number(f.mes),
        monto: Number(f.monto),
        cuenta: f.cuenta_contable,
        descripcionCuenta: f.descripcion_cuenta,
        detalle: f.detalle_gasto,
        tipoGasto: f.tipo_gasto,
        macroactividad: f.macroactividad,
        responsable: f.responsable,
        claveUnidad: (f.id_oi ?? f.id_ceco) as string,
        tipoUnidad: f.id_oi ? "oi" : "ceco",
        codigoUnidad: oi
          ? (oi.codigo_oi as string)
          : ceco
            ? `CeCo ${ceco.codigo_sap as string}`
            : "—",
        nombreUnidad: oi
          ? (oi.nombre as string | null)
          : ceco
            ? (ceco.nombre as string | null)
            : null,
        huntingZone: oi?.id_hunting_zone
          ? (hzPorId.get(oi.id_hunting_zone as string) ?? null)
          : null,
      };
    }),
    error: null,
  };
}
