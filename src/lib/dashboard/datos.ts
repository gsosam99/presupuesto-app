/**
 * Fuente única de datos del dashboard.
 *
 * La comparten la pantalla y el exportador para que el HTML descargado sea
 * exactamente lo que se ve en la app, sin recalcular nada por separado.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { fyActual, fyEtiqueta, nombreMes } from "@/lib/fiscal";
import type { Database } from "@/types/supabase";
import type {
  DatosDashboard,
  RegistroDashboard,
  RegistroIngresoDashboard,
} from "@/types";

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
  // Las dos vistas de ingresos son PARALELAS a las de gasto, no las reemplazan:
  // v_dashboard_registros y v_gasto_mensual no tienen su DDL en este repo.
  // Si la migración de ingresos todavía no se corrió, PostgREST devuelve 404,
  // `.data` queda en null y el dashboard renderiza con cero ingresos en vez de
  // romperse — el deploy del código y el pegado del SQL no tienen que ser
  // atómicos.
  const [registros, mensual, anios, hzs, ingresos, ingresoMensual] = await Promise.all([
    supabase.from("v_dashboard_registros").select("af, fase, hz, motivo, detalle, monto, n"),
    supabase.from("v_gasto_mensual").select("fy, periodo, monto"),
    supabase.from("v_anios_fiscales").select("fy, etiqueta"),
    supabase.from("hunting_zones").select("nombre").order("orden_display"),
    supabase
      .from("v_dashboard_ingresos")
      .select("af, fase, hz, motivo, detalle, monto, n, concepto"),
    supabase.from("v_ingreso_mensual").select("fy, periodo, monto"),
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

  const registrosIngreso = (
    (ingresos.data ?? []) as unknown as RegistroIngresoDashboard[]
  ).map((r) => ({ ...r, monto: Number(r.monto), n: Number(r.n) }));

  const monthlyCurrent: Record<string, number> = {};
  for (const m of (mensual.data ?? []) as unknown as FilaMensual[]) {
    if (Number(m.fy) === fyHoy) monthlyCurrent[m.periodo] = Number(m.monto);
  }

  const monthlyIncomeCurrent: Record<string, number> = {};
  for (const m of (ingresoMensual.data ?? []) as unknown as FilaMensual[]) {
    if (Number(m.fy) === fyHoy) monthlyIncomeCurrent[m.periodo] = Number(m.monto);
  }

  // Fecha de corte: último mes con ejecución REAL. Se descartan los meses de
  // cola con movimiento marginal (una provisión futura cargada por adelantado
  // no debe adelantar el corte). Misma heurística que el run-rate.
  //
  // Se calcula SÓLO con gastos: el corte es "hasta dónde llega la ejecución",
  // y dejar que un ingreso lo mueva cambiaría el significado de un KPI ya
  // establecido.
  const periodos = Object.keys(monthlyCurrent).sort();
  const montos = periodos.map((p) => monthlyCurrent[p]).sort((a, b) => a - b);
  const mediana = montos[Math.floor(montos.length / 2)] || 1;
  let fin = periodos.length;
  while (fin > 0 && monthlyCurrent[periodos[fin - 1]] < 0.2 * mediana) fin -= 1;
  const ultimo = periodos[fin - 1] ?? periodos.at(-1);
  const asof = ultimo
    ? `${nombreMes(Number(ultimo.slice(5, 7))).toLowerCase()} ${ultimo.slice(0, 4)}`
    : "—";

  // Fases y HZ salen de gastos E ingresos: si no, una zona que sólo tiene
  // ingresos desaparecería del filtro y de los gráficos.
  const todos = [...records, ...registrosIngreso];

  const fasesEnDatos = [...new Set(todos.map((r) => r.fase))];
  const fases = [
    ...ORDEN_FASES.filter((f) => fasesEnDatos.includes(f)),
    ...fasesEnDatos.filter((f) => !ORDEN_FASES.includes(f)).sort(),
  ];

  const nombresMaestra = ((hzs.data ?? []) as Array<{ nombre: string }>).map((h) => h.nombre);

  // Orden total: primero la maestra, después las zonas que sólo aparecen en los
  // datos. Que sea total importa — el consumidor busca la posición con indexOf
  // para repartir la paleta, y un -1 dejaría a esa zona sin color.
  const hzEnDatos = [...new Set([...records, ...registrosIngreso].map((r) => r.hz))];
  const hzOrdenPaleta = [
    ...nombresMaestra,
    ...hzEnDatos.filter((h) => !nombresMaestra.includes(h)).sort(),
  ];

  // Las HZ se listan por monto de mayor a menor: es el orden con el que se lee
  // un dashboard. El orden manual de la maestra (orden_display) ya no manda
  // acá; sobrevive como índice estable de la paleta (ver hzOrdenPaleta).
  //
  // Sólo entran las zonas CON movimiento, igual que antes: una HZ dada de alta
  // en la maestra pero sin gastos ni ingresos no tiene por qué ensuciar el
  // filtro ni contar como marcada por defecto.
  const montoPorHz = new Map<string, number>();
  for (const r of todos) {
    montoPorHz.set(r.hz, (montoPorHz.get(r.hz) ?? 0) + Math.abs(r.monto));
  }
  const listaHz = [...montoPorHz.keys()].sort((a, b) => {
    const diferencia = (montoPorHz.get(b) ?? 0) - (montoPorHz.get(a) ?? 0);
    if (diferencia !== 0) return diferencia;
    // Empate: se cae al orden de la maestra para no quedar al azar.
    return hzOrdenPaleta.indexOf(a) - hzOrdenPaleta.indexOf(b);
  });

  return {
    anios: listaAnios,
    currentFY: fyEtiqueta(fyHoy),
    fases,
    hzs: listaHz,
    hzOrdenPaleta,
    monthlyCurrent,
    monthlyIncomeCurrent,
    asof,
    records,
    ingresos: registrosIngreso,
  };
}
