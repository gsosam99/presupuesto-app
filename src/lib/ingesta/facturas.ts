/**
 * Carga masiva de facturas pre-registradas desde Excel.
 *
 * Formato esperado (los encabezados se matchean sin acentos ni mayúsculas,
 * y solo el número de factura es obligatorio):
 *
 *   Número de factura | Número de cuenta proveedor o acreedor | Fecha |
 *   Texto de referencia | Orden Interna | Hunting Zone |
 *   Fase | Motivo | Detalle | Monto | Moneda | Nota
 *
 * La OI y la Hunting Zone se resuelven contra las maestras por su código/nombre:
 * si no existen, la fila se rechaza con el motivo en vez de crear maestras
 * silenciosamente. Fase, Motivo y Detalle son texto libre e independientes.
 */

import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";

type Cliente = SupabaseClient<Database>;

export interface ResumenCargaFacturas {
  idCarga: string;
  nombreArchivo: string;
  filasLeidas: number;
  insertadas: number;
  rechazadas: number;
  rechazos: Array<{ fila: number; motivo: string }>;
}

function normalizarHeader(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const ALIAS: Record<string, string[]> = {
  numero: ["numero de factura", "numero factura", "factura", "n factura"],
  proveedorCodigo: [
    "numero de cuenta proveedor o acreedor",
    "numero de cuenta del proveedor o acreedor",
    "numero de cuenta proveedor",
    "cuenta proveedor",
    "codigo proveedor",
  ],
  fecha: ["fecha", "fecha de la factura", "fecha factura"],
  texto: ["texto de referencia", "texto referencia", "denominacion"],
  oi: ["orden interna", "oi", "orden"],
  hz: ["hunting zone", "proyecto", "hz"],
  fase: ["fase"],
  motivo: ["motivo"],
  detalle: ["detalle"],
  monto: ["monto", "monto de la factura", "importe"],
  moneda: ["moneda"],
  nota: ["nota", "observacion", "observaciones"],
};

function textoCelda(valor: ExcelJS.CellValue): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "object") {
    if ("result" in valor) return textoCelda((valor as { result: ExcelJS.CellValue }).result);
    if ("text" in valor) return String((valor as { text: unknown }).text).trim() || null;
    if (valor instanceof Date) return valor.toISOString().slice(0, 10);
    return null;
  }
  const s = String(valor).trim();
  return s === "" ? null : s;
}

function fechaCelda(valor: ExcelJS.CellValue): string | null {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return valor.toISOString().slice(0, 10);
  }
  const s = textoCelda(valor);
  if (s === null) return null;

  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function montoCelda(valor: ExcelJS.CellValue): number | null {
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

export async function importarFacturasExcel(
  cliente: Cliente,
  buffer: Buffer,
  opciones: { nombreArchivo: string; hashArchivo: string; idUsuario: string | null },
): Promise<ResumenCargaFacturas> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);

  const hoja = wb.worksheets[0];
  if (!hoja) throw new Error("El archivo no tiene ninguna hoja.");

  const indice = new Map<string, number>();
  hoja.getRow(1).eachCell((cell, col) => {
    indice.set(normalizarHeader(String(cell.value ?? "")), col);
  });

  const columna = (campo: keyof typeof ALIAS): number | undefined => {
    for (const alias of ALIAS[campo]) {
      const c = indice.get(alias);
      if (c !== undefined) return c;
    }
    return undefined;
  };

  if (columna("numero") === undefined) {
    throw new Error(
      `No se encontró la columna "Número de factura". ` +
        `Encabezados leídos: ${[...indice.keys()].join(" | ")}`,
    );
  }

  // --- Maestras para resolver los destinos ---------------------------------
  const [ois, hzs] = await Promise.all([
    cliente.from("ordenes_internas").select("id, codigo_oi"),
    cliente.from("hunting_zones").select("id, nombre"),
  ]);

  const oiPorCodigo = new Map(
    (ois.data ?? []).map((o) => [String(o.codigo_oi).trim().toUpperCase(), o.id as string]),
  );
  const hzPorNombre = new Map(
    (hzs.data ?? []).map((h) => [normalizarHeader(String(h.nombre)), h.id as string]),
  );
  const { data: carga, error: errorCarga } = await cliente
    .from("cargas")
    .insert({
      tipo: "preregistro_facturas",
      nombre_archivo: opciones.nombreArchivo,
      hash_archivo: opciones.hashArchivo,
      estado: "procesando",
      id_usuario: opciones.idUsuario,
    })
    .select("id")
    .single();

  if (errorCarga || !carga) {
    throw new Error(`No se pudo registrar la carga: ${errorCarga?.message}`);
  }
  const idCarga = carga.id as string;

  const registros: Array<Record<string, string | number | null>> = [];
  const rechazos: Array<{ fila: number; motivo: string }> = [];
  let filasLeidas = 0;

  hoja.eachRow({ includeEmpty: false }, (row, numero) => {
    if (numero === 1) return;

    const valor = (campo: keyof typeof ALIAS): ExcelJS.CellValue => {
      const c = columna(campo);
      return c === undefined ? null : row.getCell(c).value;
    };

    const numeroFactura = textoCelda(valor("numero"));
    if (numeroFactura === null) return; // fila vacía, no es un rechazo

    filasLeidas += 1;

    // --- Resolución de destinos, todos opcionales pero validados ----------
    let idOi: string | null = null;
    const codigoOi = textoCelda(valor("oi"));
    if (codigoOi !== null) {
      idOi = oiPorCodigo.get(codigoOi.toUpperCase()) ?? null;
      if (idOi === null) {
        rechazos.push({
          fila: numero,
          motivo: `La Orden Interna "${codigoOi}" no existe en la maestra`,
        });
        return;
      }
    }

    let idHz: string | null = null;
    const nombreHz = textoCelda(valor("hz"));
    if (nombreHz !== null) {
      idHz = hzPorNombre.get(normalizarHeader(nombreHz)) ?? null;
      if (idHz === null) {
        rechazos.push({
          fila: numero,
          motivo: `La Hunting Zone "${nombreHz}" no existe en la maestra`,
        });
        return;
      }
    }

    // Taxonomía: tres campos independientes de texto libre. No se valida
    // contra un catálogo cerrado; las sugerencias de la UI evitan el tipeo.
    const fase = textoCelda(valor("fase"));
    const motivo = textoCelda(valor("motivo"));
    const detalle = textoCelda(valor("detalle"));

    const monedaCruda = textoCelda(valor("moneda"))?.toUpperCase() ?? "USD";
    const moneda = ["VES", "BS", "BOLIVARES"].includes(monedaCruda) ? "VES" : "USD";

    registros.push({
      numero_factura: numeroFactura,
      proveedor_codigo: textoCelda(valor("proveedorCodigo")),
      texto_referencia: textoCelda(valor("texto")),
      fecha_factura: fechaCelda(valor("fecha")),
      id_oi: idOi,
      id_hunting_zone: idHz,
      fase,
      motivo,
      detalle,
      monto_estimado: montoCelda(valor("monto")),
      moneda,
      nota: textoCelda(valor("nota")),
      id_carga: idCarga,
      creado_por: opciones.idUsuario,
    });
  });

  let insertadas = 0;
  const LOTE = 500;

  for (let i = 0; i < registros.length; i += LOTE) {
    const lote = registros.slice(i, i + LOTE);
    const { data, error } = await cliente
      .from("facturas_preregistradas")
      .insert(lote)
      .select("id");

    if (error) {
      rechazos.push({ fila: i + 2, motivo: `Lote rechazado: ${error.message}` });
    } else {
      insertadas += data?.length ?? 0;
    }
  }

  if (rechazos.length > 0) {
    await cliente.from("cargas_rechazos").insert(
      rechazos.map((r) => ({ id_carga: idCarga, fila: r.fila, motivo: r.motivo })),
    );
  }

  await cliente
    .from("cargas")
    .update({
      estado: "completada",
      filas_leidas: filasLeidas,
      filas_insertadas: insertadas,
      filas_rechazadas: rechazos.length,
      finalizada_at: new Date().toISOString(),
    })
    .eq("id", idCarga);

  return {
    idCarga,
    nombreArchivo: opciones.nombreArchivo,
    filasLeidas,
    insertadas,
    rechazadas: rechazos.length,
    rechazos: rechazos.slice(0, 20),
  };
}
