/**
 * Flujo B — carga manual de presupuestos (Plan base y Extra Plan).
 *
 * El tipo (plan / extra_plan) NO viene en el archivo: lo elige el usuario al
 * subirlo, porque los formatos reales no traen una columna que los distinga.
 *
 * Cada línea apunta a una Orden Interna; el backend la resuelve contra la
 * maestra para deducir CeCo y Hunting Zone (PRD §4, Flujo B, paso 3). Si la OI
 * no existe, la fila se rechaza con el motivo — nunca se inventa la maestra.
 *
 * Columnas de los formatos estándar (se matchean sin acentos ni mayúsculas):
 *   Q | Mes | Centro de Costo | Área | Nueva Orden | Cta / Numero de Cuenta |
 *   Cuenta Contable / Descripción de cuenta | Tipo de Gasto |
 *   Detalle del Gasto | $Presupuesto | Responsable
 */

import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";

import { fyDeFecha } from "@/lib/fiscal";
import type { Database } from "@/types/supabase";
import type { TipoPresupuesto } from "@/types";

type Cliente = SupabaseClient<Database>;

const LOTE = 500;

export interface ResumenCargaPresupuesto {
  idCarga: string;
  nombreArchivo: string;
  tipo: TipoPresupuesto;
  filasLeidas: number;
  insertadas: number;
  rechazadas: number;
  montoTotal: number;
  /** Distribución por año fiscal, para cuadrar contra el Excel del usuario. */
  porFy: Array<{ fy: number; etiqueta: string; monto: number; filas: number }>;
  oisDesconocidas: string[];
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
  quarter: ["q", "quarter", "trimestre"],
  mes: ["mes", "fecha"],
  ceco: ["centro de costo", "centro de coste", "ceco"],
  area: ["area", "área"],
  oi: ["nueva orden", "orden interna", "orden", "oi"],
  cuentaA: ["cta", "numero de cuenta", "cuenta"],
  cuentaB: ["cuenta contable", "descripcion de cuenta"],
  tipoGasto: ["tipo de gasto"],
  detalleGasto: ["detalle del gasto"],
  monto: ["$presupuesto", "presupuesto", "monto", "$ presupuesto"],
  responsable: ["responsable"],
};

function textoCelda(valor: ExcelJS.CellValue): string | null {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === "object") {
    if ("result" in valor) return textoCelda((valor as { result: ExcelJS.CellValue }).result);
    if ("text" in valor) return String((valor as { text: unknown }).text).trim() || null;
    return null;
  }
  const s = String(valor).trim();
  return s === "" || s === "-" ? null : s;
}

/** Devuelve {anio, mes} desde una celda que puede ser fecha, serial o texto. */
function periodoCelda(valor: ExcelJS.CellValue): { anio: number; mes: number } | null {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return { anio: valor.getUTCFullYear(), mes: valor.getUTCMonth() + 1 };
  }
  if (typeof valor === "number" && Number.isFinite(valor)) {
    const d = new Date((valor - 25569) * 86400 * 1000);
    if (!Number.isNaN(d.getTime())) {
      return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 };
    }
  }
  const s = textoCelda(valor);
  if (s === null) return null;

  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return { anio: Number(m[1]), mes: Number(m[2]) };

  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(s);
  if (m) return { anio: Number(m[3]), mes: Number(m[2]) };

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

/**
 * Los dos formatos usan las columnas de cuenta al revés: en el Plan "Cta" es el
 * número y "Descripción de cuenta" el nombre; en el Extra Plan "Cuenta
 * Contable" es el nombre y "Numero de Cuenta" el número. Se decide por forma:
 * lo que parece código de cuenta (6+ dígitos) va al número.
 */
function repartirCuenta(
  a: string | null,
  b: string | null,
): { numero: string | null; descripcion: string | null } {
  const esCodigo = (v: string | null) => v !== null && /^\d{6,}$/.test(v.replace(/\s/g, ""));

  if (esCodigo(a) && !esCodigo(b)) return { numero: a, descripcion: b };
  if (esCodigo(b) && !esCodigo(a)) return { numero: b, descripcion: a };
  return { numero: a, descripcion: b };
}

export async function importarPresupuestoExcel(
  cliente: Cliente,
  buffer: Buffer,
  opciones: {
    nombreArchivo: string;
    hashArchivo: string;
    tipo: TipoPresupuesto;
    idUsuario: string | null;
  },
): Promise<ResumenCargaPresupuesto> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);

  const hoja = wb.worksheets[0];
  if (!hoja) throw new Error("El archivo no tiene ninguna hoja.");

  const indice = new Map<string, number>();
  hoja.getRow(1).eachCell((cell, col) => {
    const clave = normalizarHeader(String(cell.value ?? ""));
    if (clave !== "" && !indice.has(clave)) indice.set(clave, col);
  });

  const columna = (campo: keyof typeof ALIAS): number | undefined => {
    for (const alias of ALIAS[campo]) {
      const c = indice.get(alias);
      if (c !== undefined) return c;
    }
    return undefined;
  };

  const faltantes = (["oi", "mes", "monto"] as const).filter(
    (c) => columna(c) === undefined,
  );
  if (faltantes.length > 0) {
    throw new Error(
      `Faltan columnas obligatorias (${faltantes.join(", ")}). ` +
        `Se esperaba al menos "Nueva Orden", "Mes" y "$Presupuesto". ` +
        `Encabezados leídos: ${[...indice.keys()].join(" | ")}`,
    );
  }

  // Maestra de OIs: es la que deduce CeCo y Hunting Zone.
  const { data: ois, error: errorOis } = await cliente
    .from("ordenes_internas")
    .select("id, codigo_oi");
  if (errorOis) throw new Error(`Leyendo órdenes internas: ${errorOis.message}`);

  const oiPorCodigo = new Map(
    (ois ?? []).map((o) => [String(o.codigo_oi).trim().toUpperCase(), o.id as string]),
  );

  const tipoCarga =
    opciones.tipo === "plan" ? "presupuesto_plan" : "presupuesto_extra_plan";

  const { data: carga, error: errorCarga } = await cliente
    .from("cargas")
    .insert({
      tipo: tipoCarga,
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
  const oisDesconocidas = new Set<string>();
  let filasLeidas = 0;

  hoja.eachRow({ includeEmpty: false }, (row, numero) => {
    if (numero === 1) return;

    const valor = (campo: keyof typeof ALIAS): ExcelJS.CellValue => {
      const c = columna(campo);
      return c === undefined ? null : row.getCell(c).value;
    };

    const codigoOi = textoCelda(valor("oi"));
    const monto = montoCelda(valor("monto"));
    const periodo = periodoCelda(valor("mes"));

    // Fila vacía o de totales: sin OI y sin monto no aporta nada.
    if (codigoOi === null && monto === null) return;

    filasLeidas += 1;

    if (codigoOi === null) {
      rechazos.push({ fila: numero, motivo: "Sin Orden Interna" });
      return;
    }
    if (monto === null) {
      rechazos.push({ fila: numero, motivo: "Sin monto presupuestado" });
      return;
    }
    if (periodo === null) {
      rechazos.push({ fila: numero, motivo: "Mes vacío o ilegible" });
      return;
    }

    const idOi = oiPorCodigo.get(codigoOi.toUpperCase());
    if (!idOi) {
      oisDesconocidas.add(codigoOi);
      rechazos.push({
        fila: numero,
        motivo: `La Orden Interna "${codigoOi}" no existe en la maestra: cárgala antes de reintentar`,
      });
      return;
    }

    const cuenta = repartirCuenta(textoCelda(valor("cuentaA")), textoCelda(valor("cuentaB")));

    registros.push({
      id_oi: idOi,
      tipo: opciones.tipo,
      fy: fyDeFecha(new Date(Date.UTC(periodo.anio, periodo.mes - 1, 1))),
      mes: periodo.mes,
      quarter: textoCelda(valor("quarter")),
      monto,
      cuenta_contable: cuenta.numero,
      descripcion_cuenta: cuenta.descripcion,
      tipo_gasto: textoCelda(valor("tipoGasto")),
      detalle_gasto: textoCelda(valor("detalleGasto")),
      responsable: textoCelda(valor("responsable")),
      area: textoCelda(valor("area")),
      ceco_declarado: textoCelda(valor("ceco")),
      id_carga: idCarga,
    });
  });

  let insertadas = 0;

  for (let i = 0; i < registros.length; i += LOTE) {
    const lote = registros.slice(i, i + LOTE);
    const { data, error } = await cliente.from("presupuestos").insert(lote).select("id");

    if (error) {
      rechazos.push({ fila: i + 2, motivo: `Lote rechazado: ${error.message}` });
    } else {
      insertadas += data?.length ?? 0;
    }
  }

  if (rechazos.length > 0) {
    await cliente
      .from("cargas_rechazos")
      .insert(rechazos.map((r) => ({ id_carga: idCarga, fila: r.fila, motivo: r.motivo })));
  }

  // Resumen por año fiscal para que el usuario cuadre contra su planilla.
  const acumuladoFy = new Map<number, { monto: number; filas: number }>();
  for (const r of registros) {
    const fy = Number(r.fy);
    const previo = acumuladoFy.get(fy) ?? { monto: 0, filas: 0 };
    acumuladoFy.set(fy, {
      monto: previo.monto + Number(r.monto),
      filas: previo.filas + 1,
    });
  }

  const montoTotal = registros.reduce((s, r) => s + Number(r.monto), 0);

  await cliente
    .from("cargas")
    .update({
      estado: "completada",
      filas_leidas: filasLeidas,
      filas_insertadas: insertadas,
      filas_rechazadas: rechazos.length,
      mensaje:
        oisDesconocidas.size > 0
          ? `Órdenes internas fuera de la maestra: ${[...oisDesconocidas].join(", ")}`
          : null,
      finalizada_at: new Date().toISOString(),
    })
    .eq("id", idCarga);

  return {
    idCarga,
    nombreArchivo: opciones.nombreArchivo,
    tipo: opciones.tipo,
    filasLeidas,
    insertadas,
    rechazadas: rechazos.length,
    montoTotal,
    porFy: [...acumuladoFy.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([fy, v]) => ({
        fy,
        etiqueta: `${String(fy % 100).padStart(2, "0")}/${String((fy + 1) % 100).padStart(2, "0")}`,
        monto: v.monto,
        filas: v.filas,
      })),
    oisDesconocidas: [...oisDesconocidas],
    rechazos: rechazos.slice(0, 20),
  };
}
