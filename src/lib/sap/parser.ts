/**
 * Parser de los exportables de SAP.
 *
 * Los archivos vienen con extensión .xls pero NO son Excel: son MIME-HTML con
 * el cuerpo codificado en quoted-printable. Por eso no se usa una librería de
 * spreadsheets sino decodificación + parseo de la tabla HTML interna.
 *
 * Los dos reportes tienen layouts distintos y —crítico— el orden de las
 * columnas de monto está invertido entre ellos:
 *   CeCo: Real | Plan | Comprometido | Desv. absoluta | Desv. %
 *   OI:   Plan | Real | Comprometido | Desv. plan
 * Por eso las columnas de monto se ubican leyendo la fila de agrupación del
 * encabezado, nunca por posición fija.
 */

import { parse as parseHtml } from "node-html-parser";

import {
  codigoDespuesDeBarra,
  parsearFechaSap,
  parsearMontoSap,
  valorSap,
} from "./normalizar";

export type LayoutSap = "sap_ceco" | "sap_oi";

/** Una fila de gasto ya normalizada, lista para la ingesta. */
export interface FilaSap {
  /** Número de fila dentro de la tabla, para reportar rechazos. */
  fila: number;
  layout: LayoutSap;
  cecoCodigo: string | null;
  cecoNombre: string | null;
  oiCodigo: string | null;
  oiNombre: string | null;
  factura: string | null;
  proveedorCodigo: string | null;
  proveedor: string | null;
  textoReferencia: string | null;
  grupoClaseCoste: string | null;
  fecha: string | null;
  montoReal: number | null;
  montoPlan: number | null;
  montoComprometido: number | null;
}

export interface RechazoSap {
  fila: number;
  motivo: string;
  payload: Record<string, string | number | null>;
}

export interface ResultadoSap {
  layout: LayoutSap;
  filas: FilaSap[];
  rechazos: RechazoSap[];
  /** Filas de datos leídas, sin contar encabezados ni subtotales. */
  filasLeidas: number;
  /** Filas de subtotal/total que SAP inserta y se descartan. */
  filasSubtotal: number;
  /** "Resultado total" del propio archivo, para cuadrar la carga. */
  totalDeclarado: number | null;
}

// ---------------------------------------------------------------------------
// Decodificación del contenedor MIME
// ---------------------------------------------------------------------------

/**
 * Decodifica quoted-printable: "=3D" -> "=", y "=\r\n" son saltos blandos.
 * Se hace sobre bytes para no romper UTF-8 multibyte (acentos).
 */
function decodificarQuotedPrintable(buffer: Buffer): string {
  const texto = buffer.toString("binary");
  const sinSaltos = texto.replace(/=\r?\n/g, "");
  const bytes: number[] = [];

  for (let i = 0; i < sinSaltos.length; i += 1) {
    const c = sinSaltos[i];
    if (c === "=" && i + 2 < sinSaltos.length) {
      const hex = sinSaltos.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    bytes.push(sinSaltos.charCodeAt(i) & 0xff);
  }

  return Buffer.from(bytes).toString("utf8");
}

/** Detecta si el archivo es el contenedor MIME que exporta SAP. */
function esMimeHtml(buffer: Buffer): boolean {
  const cabecera = buffer.subarray(0, 400).toString("latin1");
  return /MIME-Version:/i.test(cabecera) || /Content-Type:\s*multipart/i.test(cabecera);
}

// ---------------------------------------------------------------------------
// Layouts conocidos
// ---------------------------------------------------------------------------

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Encabezados que SAP parte en dos celdas de datos: código + descripción. */
const COLUMNAS_CON_DESCRIPCION = new Set([
  "centro de coste",
  "orden",
  "numero de cuenta del proveedor o acreedor",
]);

/** Nombre canónico de cada encabezado de texto conocido. */
const CAMPOS: Record<string, keyof FilaSap> = {
  "centro de coste": "cecoCodigo",
  orden: "oiCodigo",
  factura: "factura",
  "numero de cuenta del proveedor o acreedor": "proveedorCodigo",
  "texto de referencia": "textoReferencia",
  "texto de referencia oi": "textoReferencia",
  "grupo clase de coste": "grupoClaseCoste",
  "fecha de documento": "fecha",
};

/** Descarta las descripciones de proveedor que en realidad son "sin valor". */
function nombreProveedor(desc: string | null): string | null {
  if (desc === null) return null;
  return /^sin\s+asignar/i.test(desc) || /^no\s+asignado/i.test(desc) ? null : desc;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export function parsearArchivoSap(buffer: Buffer, nombreArchivo: string): ResultadoSap {
  if (!esMimeHtml(buffer)) {
    throw new Error(
      `"${nombreArchivo}" no parece un exportable de SAP. ` +
        `Se esperaba un .xls MIME-HTML; si es un Excel real, expórtalo de nuevo desde SAP.`,
    );
  }

  const html = decodificarQuotedPrintable(buffer);
  const raiz = parseHtml(html);

  const filasCrudas: string[][] = raiz
    .querySelectorAll("tr")
    .map((tr) =>
      tr
        .querySelectorAll("td, th")
        .map((td) => td.textContent.replace(/ /g, " ").replace(/\s+/g, " ").trim()),
    );

  // --- Encabezados --------------------------------------------------------
  const idxNombres = filasCrudas.findIndex((f) =>
    f.some((c) => normalizar(c) === "fecha de documento"),
  );
  if (idxNombres === -1) {
    throw new Error(
      `No se encontró la fila de encabezados en "${nombreArchivo}" ` +
        `(se busca la columna "Fecha de documento").`,
    );
  }

  const nombres = filasCrudas[idxNombres];
  const grupos = (filasCrudas[idxNombres - 1] ?? []).filter((c) => c !== "");

  // Etiquetas de los montos: "Real", "Plan", "Comprometido", "Desviación ..."
  if (grupos.length === 0) {
    throw new Error(
      `No se encontró la fila de agrupación de montos en "${nombreArchivo}". ` +
        `Sin ella no se puede saber cuál columna es Real y cuál Plan.`,
    );
  }

  // --- Ancho de las filas de datos ----------------------------------------
  // Las filas de subtotal traen menos celdas, así que el ancho de datos es el
  // más frecuente entre las filas posteriores al encabezado.
  const conteoAnchos = new Map<number, number>();
  for (const f of filasCrudas.slice(idxNombres + 1)) {
    conteoAnchos.set(f.length, (conteoAnchos.get(f.length) ?? 0) + 1);
  }
  const ancho = [...conteoAnchos.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!ancho) {
    throw new Error(`"${nombreArchivo}" no contiene filas de datos.`);
  }

  // --- Mapeo de columnas ---------------------------------------------------
  const nombresTexto = nombres.filter(
    (n) => !["usd2", "%"].includes(normalizar(n)) && n !== "",
  );

  const posiciones = new Map<keyof FilaSap, number>();
  const posicionesDesc = new Map<keyof FilaSap, number>();
  let cursor = 0;

  for (const nombre of nombresTexto) {
    const clave = normalizar(nombre);
    const campo = CAMPOS[clave];
    if (campo) posiciones.set(campo, cursor);
    cursor += 1;
    if (COLUMNAS_CON_DESCRIPCION.has(clave)) {
      if (campo) posicionesDesc.set(campo, cursor);
      cursor += 1;
    }
  }

  const montoInicio = ancho - grupos.length;
  if (cursor !== montoInicio) {
    throw new Error(
      `El layout de "${nombreArchivo}" no coincide con lo esperado: ` +
        `las columnas de texto ocupan ${cursor} celdas pero los montos empiezan en ${montoInicio}. ` +
        `Encabezados leídos: ${nombres.join(" | ")}`,
    );
  }

  const indiceMonto = (etiqueta: string): number | null => {
    const i = grupos.findIndex((g) => normalizar(g) === etiqueta);
    return i === -1 ? null : montoInicio + i;
  };

  const iReal = indiceMonto("real");
  const iPlan = indiceMonto("plan");
  const iComprometido = indiceMonto("comprometido");

  if (iReal === null) {
    throw new Error(
      `"${nombreArchivo}" no tiene columna "Real". Etiquetas encontradas: ${grupos.join(" | ")}`,
    );
  }

  const layout: LayoutSap = posiciones.has("cecoCodigo") ? "sap_ceco" : "sap_oi";

  // --- Filas ---------------------------------------------------------------
  const filas: FilaSap[] = [];
  const rechazos: RechazoSap[] = [];
  let filasSubtotal = 0;
  let totalDeclarado: number | null = null;

  for (const [i, celdas] of filasCrudas.slice(idxNombres + 1).entries()) {
    const numeroFila = idxNombres + 2 + i;

    // Filas de subtotal / "Resultado total": SAP las emite con menos celdas.
    if (celdas.length !== ancho) {
      if (celdas.some((c) => c !== "")) {
        filasSubtotal += 1;
        if (normalizar(celdas[0] ?? "").startsWith("resultado")) {
          // El total del propio archivo sirve para cuadrar la carga.
          const montos = celdas.slice(1).map(parsearMontoSap).filter((m) => m !== null);
          const posReal = grupos.findIndex((g) => normalizar(g) === "real");
          totalDeclarado = montos[posReal] ?? null;
        }
      }
      continue;
    }

    const en = (campo: keyof FilaSap): string | null => {
      const p = posiciones.get(campo);
      return p === undefined ? null : valorSap(celdas[p]);
    };
    const desc = (campo: keyof FilaSap): string | null => {
      const p = posicionesDesc.get(campo);
      return p === undefined ? null : valorSap(celdas[p]);
    };

    const fecha = parsearFechaSap(en("fecha"));
    const montoReal = iReal === null ? null : parsearMontoSap(celdas[iReal]);

    const payload: Record<string, string | number | null> = {
      ceco: en("cecoCodigo"),
      orden: en("oiCodigo"),
      factura: en("factura"),
      texto: en("textoReferencia"),
      fecha: en("fecha"),
      real: iReal === null ? null : (celdas[iReal] ?? null),
    };

    // Sin monto real no hay ejecución: son líneas de solo Plan o Comprometido.
    if (montoReal === null) {
      rechazos.push({
        fila: numeroFila,
        motivo: "Fila sin monto Real (solo Plan o Comprometido): no es un gasto ejecutado",
        payload,
      });
      continue;
    }
    if (fecha === null) {
      rechazos.push({
        fila: numeroFila,
        motivo: "Fecha de documento vacía o ilegible",
        payload,
      });
      continue;
    }

    filas.push({
      fila: numeroFila,
      layout,
      cecoCodigo: codigoDespuesDeBarra(en("cecoCodigo")),
      cecoNombre: desc("cecoCodigo"),
      oiCodigo: en("oiCodigo"),
      oiNombre: desc("oiCodigo"),
      factura: en("factura"),
      proveedorCodigo: codigoDespuesDeBarra(en("proveedorCodigo")),
      // En el reporte de CeCo la descripción del proveedor suele venir como
      // "Sin asignar/74277": es un marcador de nulo con el número pegado.
      proveedor: nombreProveedor(desc("proveedorCodigo")),
      textoReferencia: en("textoReferencia"),
      grupoClaseCoste: en("grupoClaseCoste"),
      fecha,
      montoReal,
      montoPlan: iPlan === null ? null : parsearMontoSap(celdas[iPlan]),
      montoComprometido:
        iComprometido === null ? null : parsearMontoSap(celdas[iComprometido]),
    });
  }

  return {
    layout,
    filas,
    rechazos,
    filasLeidas: filas.length + rechazos.length,
    filasSubtotal,
    totalDeclarado,
  };
}
