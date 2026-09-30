/**
 * Cuenta de fondos por unidad presupuestaria (OI, o CeCo si la Hunting Zone
 * no tiene OI), mes a mes.
 *
 * La regla vive en la función SQL fondos_mensuales() (schema.sql, sección 17):
 * finanzas habilita el plan cada mes y retira lo no usado al cerrar cada
 * trimestre, salvo lo declarado como provisión. Acá solo se consulta y se
 * agrupa para las pantallas.
 *
 * Solo `monto_real` (SAP) es gasto. Plan, suplementos, devoluciones,
 * provisiones y retiros son la cuenta de fondos del área: sirven para saber
 * cuánto hay disponible y qué pasó con el dinero, y no tocan el dashboard.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { EstadoTrimestre, FondoMensual, Trimestre } from "@/types";
import type { Database } from "@/types/supabase";

export async function obtenerFondos(
  supabase: SupabaseClient<Database>,
  fy: number,
): Promise<FondoMensual[]> {
  const { data, error } = await supabase.rpc("fondos_mensuales", { p_fy: fy });
  if (error) throw new Error(`Fondos: ${error.message}`);

  return ((data ?? []) as unknown as FondoMensual[]).map((f) => ({
    ...f,
    mes: Number(f.mes),
    trimestre: Number(f.trimestre) as Trimestre,
    plan: Number(f.plan),
    suplementos: Number(f.suplementos),
    devoluciones: Number(f.devoluciones),
    monto_real: Number(f.monto_real),
    provision_recibida: Number(f.provision_recibida),
    disponible: Number(f.disponible),
    provision_siguiente: Number(f.provision_siguiente),
    retirado: Number(f.retirado),
  }));
}

export interface TrimestreFondos {
  trimestre: Trimestre;
  estado: EstadoTrimestre;
  meses: FondoMensual[];
  plan: number;
  suplementos: number;
  devoluciones: number;
  real: number;
  provisionRecibida: number;
  /** Disponible al final del trimestre (o hasta hoy, si está en curso). */
  disponibleFinal: number;
  /** Solo en trimestres cerrados: provisión que pasó al siguiente. */
  provisionSiguiente: number;
  /** Solo en trimestres cerrados: lo que finanzas retiró. */
  retirado: number;
}

export interface UnidadFondos {
  clave: string;
  idOi: string | null;
  /** Solo en unidades presupuestadas por Centro de Costo (sin OI). */
  idCeco: string | null;
  codigo: string;
  huntingZone: string | null;
  trimestres: TrimestreFondos[];
  plan: number;
  suplementos: number;
  devoluciones: number;
  real: number;
  retirado: number;
  /** Disponible del mes en curso: lo que se puede imputar hoy. */
  disponibleHoy: number;
  /** Plan + suplementos − devoluciones de los meses que aún no empezaron. */
  porHabilitar: number;
  /** Provisión recibida por el trimestre en curso. */
  provisionVigente: number;
}

function estadoDeTrimestre(meses: FondoMensual[]): EstadoTrimestre {
  if (meses.some((m) => m.estado_mes === "actual")) return "actual";
  return meses.every((m) => m.estado_mes === "cerrado") ? "cerrado" : "futuro";
}

/** Agrupa las filas por unidad y trimestre para las tarjetas de Fondos. */
export function agruparPorUnidad(filas: FondoMensual[]): UnidadFondos[] {
  const porUnidad = new Map<string, FondoMensual[]>();
  for (const f of filas) {
    const lista = porUnidad.get(f.clave) ?? [];
    lista.push(f);
    porUnidad.set(f.clave, lista);
  }

  const unidades: UnidadFondos[] = [];
  for (const [clave, meses] of porUnidad) {
    const primero = meses[0];
    const trimestres: TrimestreFondos[] = ([1, 2, 3, 4] as const).map((t) => {
      const delTrimestre = meses.filter((m) => m.trimestre === t);
      const suma = (f: (m: FondoMensual) => number): number =>
        delTrimestre.reduce((s, m) => s + f(m), 0);
      const estado = estadoDeTrimestre(delTrimestre);
      const hastaHoy = delTrimestre.filter((m) => m.estado_mes !== "futuro");
      return {
        trimestre: t,
        estado,
        meses: delTrimestre,
        plan: suma((m) => m.plan),
        suplementos: suma((m) => m.suplementos),
        devoluciones: suma((m) => m.devoluciones),
        real: suma((m) => m.monto_real),
        provisionRecibida: suma((m) => m.provision_recibida),
        disponibleFinal: (estado === "actual" ? hastaHoy : delTrimestre).at(-1)?.disponible ?? 0,
        provisionSiguiente: suma((m) => m.provision_siguiente),
        retirado: suma((m) => m.retirado),
      };
    });

    const suma = (f: (m: FondoMensual) => number): number => meses.reduce((s, m) => s + f(m), 0);
    const actual = meses.find((m) => m.estado_mes === "actual");

    unidades.push({
      clave,
      idOi: primero.id_oi,
      idCeco: primero.id_oi ? null : primero.id_ceco,
      codigo: primero.codigo_oi ?? primero.codigo_ceco ?? "—",
      huntingZone: primero.hunting_zone,
      trimestres,
      plan: suma((m) => m.plan),
      suplementos: suma((m) => m.suplementos),
      devoluciones: suma((m) => m.devoluciones),
      real: suma((m) => m.monto_real),
      retirado: suma((m) => m.retirado),
      disponibleHoy: actual?.disponible ?? 0,
      porHabilitar: meses
        .filter((m) => m.estado_mes === "futuro")
        .reduce((s, m) => s + m.plan + m.suplementos - m.devoluciones, 0),
      provisionVigente: trimestres.find((t) => t.estado === "actual")?.provisionRecibida ?? 0,
    });
  }

  return unidades.sort((a, b) => b.plan + b.suplementos - (a.plan + a.suplementos));
}
