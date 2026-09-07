/**
 * Fuente única de datos del dashboard.
 *
 * La comparten la pantalla y el exportador para que el HTML descargado sea
 * exactamente lo que se ve en la app, sin recalcular nada por separado.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { fyActual, fyEtiqueta, nombreMes } from "@/lib/fiscal";
import type { Database } from "@/types/supabase";
import type { DatosDashboard, RegistroDashboard } from "@/types";

interface FilaMensual {
  fy: number;
  periodo: string;
  monto: number;
}

const ORDEN_FASES = [
  "Ideación",
  "Incubación",
  "Escalamiento",
  "Continuidad Operativa",
  "(sin asignar)",
];

export async function obtenerDatosDashboard(
  supabase: SupabaseClient<Database>,
): Promise<DatosDashboard> {
  const [registros, mensual, anios, hzs] = await Promise.all([
    supabase.from("v_dashboard_registros").select("af, fase, hz, motivo, detalle, monto, n"),
    supabase.from("v_gasto_mensual").select("fy, periodo, monto"),
    supabase.from("v_anios_fiscales").select("fy, etiqueta"),
    supabase.from("hunting_zones").select("nombre").order("orden_display"),
  ]);

  const fyHoy = fyActual();

  const listaAnios = ((anios.data ?? []) as Array<{ fy: number; etiqueta: string }>)
    .sort((a, b) => a.fy - b.fy)
    .map((a) => a.etiqueta);

  const records = ((registros.data ?? []) as unknown as RegistroDashboard[]).map((r) => ({
    ...r,
    monto: Number(r.monto),
    n: Number(r.n),
  }));

  const monthlyCurrent: Record<string, number> = {};
  for (const m of (mensual.data ?? []) as unknown as FilaMensual[]) {
    if (Number(m.fy) === fyHoy) monthlyCurrent[m.periodo] = Number(m.monto);
  }

  // Fecha de corte: último mes con ejecución REAL. Se descartan los meses de
  // cola con movimiento marginal (una provisión futura cargada por adelantado
  // no debe adelantar el corte). Misma heurística que el run-rate.
  const periodos = Object.keys(monthlyCurrent).sort();
  const montos = periodos.map((p) => monthlyCurrent[p]).sort((a, b) => a - b);
  const mediana = montos[Math.floor(montos.length / 2)] || 1;
  let fin = periodos.length;
  while (fin > 0 && monthlyCurrent[periodos[fin - 1]] < 0.2 * mediana) fin -= 1;
  const ultimo = periodos[fin - 1] ?? periodos.at(-1);
  const asof = ultimo
    ? `${nombreMes(Number(ultimo.slice(5, 7))).toLowerCase()} ${ultimo.slice(0, 4)}`
    : "—";

  const fasesEnDatos = [...new Set(records.map((r) => r.fase))];
  const fases = [
    ...ORDEN_FASES.filter((f) => fasesEnDatos.includes(f)),
    ...fasesEnDatos.filter((f) => !ORDEN_FASES.includes(f)).sort(),
  ];

  const hzMaestra = ((hzs.data ?? []) as Array<{ nombre: string }>).map((h) => h.nombre);
  const hzEnDatos = [...new Set(records.map((r) => r.hz))];
  const listaHz = [
    ...hzMaestra.filter((h) => hzEnDatos.includes(h)),
    ...hzEnDatos.filter((h) => !hzMaestra.includes(h)),
  ];

  return {
    anios: listaAnios,
    currentFY: fyEtiqueta(fyHoy),
    fases,
    hzs: listaHz,
    monthlyCurrent,
    asof,
    records,
  };
}
