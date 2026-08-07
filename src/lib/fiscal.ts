/**
 * Utilidades de año fiscal IENN. Espejo exacto de las funciones SQL
 * public.fy_de_fecha() y public.fy_etiqueta() en supabase/schema.sql.
 *
 * El ciclo fiscal arranca en OCTUBRE:
 *   FY 2025 == "25/26" == Oct-2025 .. Sep-2026
 */

/** Mes en que arranca el año fiscal (1-12). */
export const MES_INICIO_FY = 10;

/** Año fiscal (año de inicio del ciclo) de una fecha. */
export function fyDeFecha(fecha: Date): number {
  return fecha.getFullYear() - (fecha.getMonth() + 1 >= MES_INICIO_FY ? 0 : 1);
}

/** Etiqueta legible del FY: 2025 -> "25/26". */
export function fyEtiqueta(fy: number): string {
  const inicio = String(fy % 100).padStart(2, "0");
  const fin = String((fy + 1) % 100).padStart(2, "0");
  return `${inicio}/${fin}`;
}

/** Posición del mes calendario dentro del FY (octubre = 1, septiembre = 12). */
export function posicionEnFy(mes: number): number {
  return ((mes - MES_INICIO_FY + 12) % 12) + 1;
}

/** Meses calendario del FY en orden de presentación: Oct, Nov, ... Sep. */
export const MESES_FY: readonly number[] = Array.from(
  { length: 12 },
  (_, i) => ((MES_INICIO_FY - 1 + i) % 12) + 1,
);

const NOMBRES_MES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
] as const;

/** Nombre corto del mes (1-12). */
export function nombreMes(mes: number): string {
  return NOMBRES_MES[mes - 1] ?? String(mes);
}

/** Primer día calendario del FY. */
export function inicioFy(fy: number): Date {
  return new Date(Date.UTC(fy, MES_INICIO_FY - 1, 1));
}

/** Último día calendario del FY. */
export function finFy(fy: number): Date {
  return new Date(Date.UTC(fy + 1, MES_INICIO_FY - 1, 0));
}

/** Trimestre del año fiscal al que pertenece un mes calendario. */
export function trimestreDeMes(mes: number): 1 | 2 | 3 | 4 {
  return ((((mes + 2) % 12) / 3) | 0) + 1 as 1 | 2 | 3 | 4;
}

/** Meses calendario de un trimestre fiscal, en orden. */
export function mesesDeTrimestre(trimestre: number): number[] {
  const inicio = MES_INICIO_FY - 1 + (trimestre - 1) * 3;
  return [0, 1, 2].map((i) => ((inicio + i) % 12) + 1);
}

/** Etiqueta legible: "T2 · Ene–Mar". */
export function etiquetaTrimestre(trimestre: number): string {
  const meses = mesesDeTrimestre(trimestre);
  return `T${trimestre} · ${nombreMes(meses[0])}–${nombreMes(meses[2])}`;
}

/** Trimestre fiscal en curso para una fecha dada. */
export function trimestreActual(hoy = new Date()): 1 | 2 | 3 | 4 {
  return trimestreDeMes(hoy.getMonth() + 1);
}
