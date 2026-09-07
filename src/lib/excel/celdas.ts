/**
 * Helpers de lectura de celdas de Excel, compartidos por los parsers de
 * facturas y presupuestos (src/lib/ingesta/*.ts). El parser de SAP tiene su
 * propio formato de reporte y sus propias reglas — no se tocó acá.
 */

import type ExcelJS from "exceljs";

/** Encabezado normalizado: sin acentos, sin mayúsculas, espacios colapsados. */
export function normalizarHeader(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

interface OpcionesTexto {
  /** Si es true, una celda con solo "-" se trata como vacía (null). */
  tratarGuionComoVacio?: boolean;
}

/** Texto plano de una celda, o null si está vacía. */
export function textoCelda(
  valor: ExcelJS.CellValue,
  opciones: OpcionesTexto = {},
): string | null {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === "object") {
    if ("result" in valor) {
      return textoCelda((valor as { result: ExcelJS.CellValue }).result, opciones);
    }
    if ("text" in valor) return String((valor as { text: unknown }).text).trim() || null;
    return null;
  }
  const s = String(valor).trim();
  if (s === "") return null;
  if (opciones.tratarGuionComoVacio && s === "-") return null;
  return s;
}

/** Monto numérico de una celda, aceptando formato con coma o punto decimal. */
export function montoCelda(valor: ExcelJS.CellValue): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  const s = textoCelda(valor);
  if (s === null) return null;

  const limpio = s.replace(/[^\d,.-]/g, "");
  const tieneComa = limpio.includes(",");
  const tienePunto = limpio.includes(".");
  let n = limpio;
  if (tieneComa && tienePunto) {
    n =
      limpio.lastIndexOf(",") > limpio.lastIndexOf(".")
        ? limpio.replace(/\./g, "").replace(",", ".")
        : limpio.replace(/,/g, "");
  } else if (tieneComa) {
    n = limpio.replace(",", ".");
  }
  const num = Number(n);
  return Number.isFinite(num) ? num : null;
}
