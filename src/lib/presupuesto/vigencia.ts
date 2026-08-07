/**
 * Vigencia de las órdenes internas.
 *
 * Una OI puede durar un mes, un año fiscal o lo que dure un proyecto. Los
 * selectores muestran solo las vigentes para la fecha en juego, de modo que no
 * se pueda imputar un gasto a una orden que ya venció.
 */

import { finFy, inicioFy } from "@/lib/fiscal";

export interface ConVigencia {
  vigencia_desde: string | null;
  vigencia_hasta: string | null;
}

/** Una vigencia sin límites se considera siempre abierta. */
export function vigenteEnFecha(oi: ConVigencia, fecha: Date): boolean {
  const iso = fecha.toISOString().slice(0, 10);
  if (oi.vigencia_desde && iso < oi.vigencia_desde) return false;
  if (oi.vigencia_hasta && iso > oi.vigencia_hasta) return false;
  return true;
}

/** Vigente en algún momento del año fiscal: basta con que los rangos se crucen. */
export function vigenteEnFy(oi: ConVigencia, fy: number): boolean {
  const desdeFy = inicioFy(fy).toISOString().slice(0, 10);
  const hastaFy = finFy(fy).toISOString().slice(0, 10);
  if (oi.vigencia_hasta && oi.vigencia_hasta < desdeFy) return false;
  if (oi.vigencia_desde && oi.vigencia_desde > hastaFy) return false;
  return true;
}

/** Texto corto para mostrar junto al código en los selectores. */
export function etiquetaVigencia(oi: ConVigencia): string | null {
  if (!oi.vigencia_desde && !oi.vigencia_hasta) return null;
  const corta = (iso: string) => iso.slice(0, 7).split("-").reverse().join("/");
  if (oi.vigencia_desde && oi.vigencia_hasta) {
    return `${corta(oi.vigencia_desde)} – ${corta(oi.vigencia_hasta)}`;
  }
  if (oi.vigencia_hasta) return `hasta ${corta(oi.vigencia_hasta)}`;
  return `desde ${corta(oi.vigencia_desde as string)}`;
}
