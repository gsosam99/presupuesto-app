/**
 * Detección de repetidos ANTES de escribir nada.
 *
 * Dos señales, con roles deliberadamente distintos:
 *
 *   - `exacta`   La fila ya está en la base con el mismo hash_dedupe. Es la
 *                misma clave única que hace cumplir Postgres, así que el
 *                insert la ignoraría igual. Informativa.
 *
 *   - `probable` Hay un gasto con la MISMA fecha, el MISMO número de factura
 *                y el MISMO monto, pero distinto hash — típicamente porque el
 *                proveedor o el texto de referencia se escribieron distinto.
 *                Pasa siempre entre el consolidado manual y los exportables de
 *                SAP, que no formatean esos campos igual. Es una ADVERTENCIA
 *                para que la revise una persona: nunca borra nada ni bloquea
 *                la carga por sí sola.
 *
 * Por qué la clave "probable" EXIGE número de factura: sin él quedaría
 * `fecha|monto`, y dos gastos distintos del mismo día por el mismo importe
 * colapsarían en uno. Medido contra los datos reales de la base, esa variante
 * degenerada marcaba como repetidas 100 filas legítimas ya cargadas. Sólo la
 * mitad de las filas de SAP traen factura, así que esta señal cubre esa mitad
 * y el resto queda —correctamente— como "nueva".
 *
 * El día que el exportable de SAP incluya el número de documento contable,
 * esto se reemplaza por una comparación exacta y deja de ser heurístico.
 */

import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizarNumeroFactura } from "@/lib/sap/normalizar";
import type { Database } from "@/types/supabase";

type Cliente = SupabaseClient<Database>;

export type EstadoDuplicado = "nueva" | "exacta" | "probable";

/** Campos mínimos para comparar una fila, venga del archivo o de la base. */
export interface FilaComparable {
  proveedor: string | null;
  factura: string | null;
  textoReferencia: string | null;
  fecha: string;
  montoReal: number;
}

const EPOCA = Date.UTC(1970, 0, 1);

/** Días desde 1970-01-01 de una fecha ISO "YYYY-MM-DD", igual que Postgres. */
function diasEpoch(iso: string): number {
  const [a, m, d] = iso.split("-").map(Number);
  return Math.round((Date.UTC(a, m - 1, d) - EPOCA) / 86_400_000);
}

/**
 * Espejo EXACTO de la columna generada `gastos.hash_dedupe`
 * (supabase/schema.sql, sección 4). Si cambia allá, cambia acá.
 *
 * La fecha va como días-epoch y el monto como centavos enteros porque en
 * Postgres una columna generada exige expresiones IMMUTABLE, y `date::text` y
 * `numeric::text` dependen de la configuración regional de la sesión.
 */
export function hashDedupe(f: FilaComparable): string {
  const texto =
    (f.proveedor?.trim().toUpperCase() ?? "") +
    "|" +
    (f.factura?.trim() ?? "") +
    "|" +
    (f.textoReferencia?.trim().toUpperCase() ?? "") +
    "|" +
    String(diasEpoch(f.fecha)) +
    "|" +
    String(Math.round(f.montoReal * 100));

  return createHash("md5").update(texto, "utf8").digest("hex");
}

/**
 * Clave de "probable repetido". Devuelve null cuando la fila no tiene número
 * de factura: sin él la clave no distingue gastos distintos y haría más daño
 * que bien.
 *
 * `facturaYaNormalizada` evita re-normalizar lo que Postgres ya guardó en la
 * columna generada `factura_normalizada`.
 */
export function claveProbable(
  fecha: string,
  factura: string | null,
  montoReal: number,
  facturaYaNormalizada = false,
): string | null {
  const numero = facturaYaNormalizada ? factura : normalizarNumeroFactura(factura);
  if (numero === null || numero === "") return null;
  return `${fecha}|${numero}|${Math.round(montoReal * 100)}`;
}

export interface IndiceExistentes {
  hashes: Set<string>;
  probables: Set<string>;
}

/**
 * Índice de lo ya cargado, acotado al rango de fechas que cubren los archivos.
 * Ambas claves incluyen la fecha, así que traer sólo ese rango es suficiente y
 * evita arrastrar la tabla entera.
 */
export async function cargarIndiceExistentes(
  cliente: Cliente,
  desde: string,
  hasta: string,
): Promise<IndiceExistentes> {
  const hashes = new Set<string>();
  const probables = new Set<string>();
  const paso = 1000;

  for (let inicio = 0; ; inicio += paso) {
    const { data, error } = await cliente
      .from("gastos")
      .select("hash_dedupe, fecha_documento, factura_normalizada, monto_real")
      .gte("fecha_documento", desde)
      .lte("fecha_documento", hasta)
      .range(inicio, inicio + paso - 1);

    if (error) throw new Error(`Leyendo gastos para comparar: ${error.message}`);

    const filas = (data ?? []) as unknown as Array<{
      hash_dedupe: string;
      fecha_documento: string;
      factura_normalizada: string | null;
      monto_real: number;
    }>;

    for (const g of filas) {
      hashes.add(g.hash_dedupe);
      const clave = claveProbable(
        g.fecha_documento,
        g.factura_normalizada,
        Number(g.monto_real),
        true,
      );
      if (clave !== null) probables.add(clave);
    }

    if (filas.length < paso) break;
  }

  return { hashes, probables };
}

/** Clasifica una fila del archivo contra lo que ya está cargado. */
export function clasificarDuplicado(
  fila: FilaComparable,
  indice: IndiceExistentes,
): EstadoDuplicado {
  if (indice.hashes.has(hashDedupe(fila))) return "exacta";

  const clave = claveProbable(fila.fecha, fila.factura, fila.montoReal);
  if (clave !== null && indice.probables.has(clave)) return "probable";

  return "nueva";
}

/** ¿La fecha ISO cae dentro del rango? Los límites son inclusivos y opcionales. */
export function dentroDeRango(
  fecha: string,
  desde: string | null,
  hasta: string | null,
): boolean {
  if (desde !== null && fecha < desde) return false;
  if (hasta !== null && fecha > hasta) return false;
  return true;
}
