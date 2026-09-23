/**
 * Sugerencias para el match manual factura ↔ gasto (asistente de Triaje, paso 4).
 *
 * El cruce automático (sap.ts) es determinístico: número de factura
 * normalizado, desempatado por la cuenta del proveedor. Lo que llega acá es lo
 * que ese cruce NO resolvió: números tipeados distinto ("A-0250" vs "A0250"),
 * facturas con más de un candidato, o sin número en SAP.
 *
 * Esto solo ORDENA candidatas para que una persona elija. Nunca asocia nada
 * solo: el monto en particular jamás decide (la factura puede estar en Bs y SAP
 * la convierte a la tasa BCV del día), apenas suma puntos si coincide.
 *
 * Función pura: no toca la base, se puede probar con datos sueltos.
 */

import { claveComparacion, normalizarNumeroFactura } from "@/lib/sap/normalizar";

export interface GastoACruzar {
  id: string;
  factura: string | null;
  proveedor_codigo: string | null;
  fecha_documento: string;
  monto_real: number;
}

export interface FacturaCandidata {
  id: string;
  numero_factura: string;
  proveedor_codigo: string | null;
  fecha_factura: string | null;
  monto_estimado: number | null;
  moneda: string;
}

export interface Sugerencia {
  idFactura: string;
  puntaje: number;
  /** Por qué se sugiere, en lenguaje de usuario. */
  motivos: string[];
}

/** Puntaje mínimo para mostrar una candidata. */
const UMBRAL = 30;
const MAX_SUGERENCIAS = 3;

function distanciaEdicion(a: string, b: string): number {
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const arriba = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = arriba;
    }
  }
  return fila[b.length];
}

/** Número sin separadores: "A-0250" y "A0250" son la misma factura tipeada distinto. */
function soloAlfanumerico(numero: string | null): string | null {
  const n = normalizarNumeroFactura(numero);
  if (n === null) return null;
  const limpio = n.replace(/[^0-9A-Z]/g, "").replace(/^0+/, "");
  return limpio === "" ? null : limpio;
}

function diasEntre(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
}

export function puntuar(gasto: GastoACruzar, factura: FacturaCandidata): Sugerencia {
  const motivos: string[] = [];
  let puntaje = 0;

  const ng = soloAlfanumerico(gasto.factura);
  const nf = soloAlfanumerico(factura.numero_factura);
  if (ng !== null && nf !== null) {
    if (ng === nf) {
      puntaje += 50;
      motivos.push("mismo número de factura");
    } else if (Math.min(ng.length, nf.length) >= 3 && (ng.includes(nf) || nf.includes(ng))) {
      puntaje += 30;
      motivos.push("un número contiene al otro");
    } else if (
      Math.min(ng.length, nf.length) >= 4 &&
      // Atajo: con más de 2 caracteres de diferencia de largo la distancia ya es > 2.
      Math.abs(ng.length - nf.length) <= 2 &&
      distanciaEdicion(ng, nf) <= 2
    ) {
      puntaje += 20;
      motivos.push("número parecido");
    }
  }

  const pg = claveComparacion(gasto.proveedor_codigo);
  if (pg !== null && pg === claveComparacion(factura.proveedor_codigo)) {
    puntaje += 25;
    motivos.push("misma cuenta de proveedor");
  }

  if (factura.fecha_factura) {
    const dias = diasEntre(gasto.fecha_documento, factura.fecha_factura);
    if (dias <= 15) {
      puntaje += Math.round(15 - dias);
      motivos.push(dias < 1 ? "misma fecha" : `fechas a ${Math.round(dias)} días`);
    } else if (dias <= 45) {
      puntaje += 3;
    }
  }

  if (factura.moneda === "USD" && factura.monto_estimado !== null && factura.monto_estimado !== 0) {
    const desvio =
      Math.abs(gasto.monto_real - factura.monto_estimado) / Math.abs(factura.monto_estimado);
    if (desvio <= 0.02) {
      puntaje += 15;
      motivos.push("mismo monto");
    } else if (desvio <= 0.05) {
      puntaje += 8;
      motivos.push("monto parecido");
    }
  }

  return { idFactura: factura.id, puntaje, motivos };
}

/** Las mejores candidatas para un gasto, de mayor a menor puntaje. */
export function sugerirFacturas(
  gasto: GastoACruzar,
  facturas: readonly FacturaCandidata[],
): Sugerencia[] {
  return facturas
    .map((f) => puntuar(gasto, f))
    .filter((s) => s.puntaje >= UMBRAL)
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, MAX_SUGERENCIAS);
}
