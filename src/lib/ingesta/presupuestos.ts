/**
 * Flujo B — carga manual de presupuestos (Plan base y Extra Plan).
 *
 * El tipo (plan / extra_plan) NO viene en el archivo: lo elige el usuario al
 * subirlo, porque los formatos reales no traen una columna que los distinga.
 *
 * Cada línea apunta a una Orden Interna, o a un Centro de Costo cuando el
 * área se presupuesta directo al CeCo (sin orden). El backend las resuelve
 * contra las maestras; si no existen, la fila se rechaza con el motivo —
 * nunca se inventa la maestra. Las líneas con monto 0 se omiten.
 *
 * Columnas de los formatos estándar (se matchean sin acentos ni mayúsculas):
 *   Q | Mes | Centro de Costo | Área | Nueva Orden | Cta / Numero de Cuenta |
 *   Cuenta Contable / Descripción de cuenta | Tipo de Gasto |
 *   Detalle del Gasto | $Presupuesto | Responsable | Macroactividad (opcional)
 *
 * Flujo en dos pasos: analizarPresupuestoExcel() no escribe nada (vista
 * previa con totales por orden/CeCo para cuadrar contra el Excel) e
 * importarPresupuestoExcel() escribe lo mismo que se previsualizó.
 */

import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";

import { montoCelda, normalizarHeader, textoCelda as textoCeldaBase } from "@/lib/excel/celdas";
import { fyDeFecha } from "@/lib/fiscal";
import type { Database } from "@/types/supabase";
import type { TipoPresupuesto } from "@/types";

type Cliente = SupabaseClient<Database>;

const LOTE = 500;

interface RegistroPresupuesto {
  id_oi: string | null;
  id_ceco: string | null;
  macroactividad: string | null;
  tipo: TipoPresupuesto;
  fy: number;
  mes: number;
  quarter: string | null;
  monto: number;
  cuenta_contable: string | null;
  descripcion_cuenta: string | null;
  tipo_gasto: string | null;
  detalle_gasto: string | null;
  responsable: string | null;
  area: string | null;
  ceco_declarado: string | null;
  id_carga: string;
}

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

/** Una línea del archivo en la vista previa, para auditarla antes de cargar. */
export interface LineaPrevia {
  fila: number;
  /** "YYYY-MM" */
  periodo: string;
  cuenta: string | null;
  detalle: string | null;
  macroactividad: string | null;
  responsable: string | null;
  monto: number;
}

/** Totales de una orden o CeCo en la vista previa. */
export interface UnidadPrevia {
  unidad: string;
  tipo: "oi" | "ceco";
  nombre: string | null;
  lineas: number;
  monto: number;
  conMacroactividad: number;
  lineasDetalle: LineaPrevia[];
}

export interface PreviaPresupuesto {
  nombreArchivo: string;
  filasLeidas: number;
  lineas: number;
  omitidasEnCero: number;
  montoTotal: number;
  porFy: ResumenCargaPresupuesto["porFy"];
  porUnidad: UnidadPrevia[];
  macroactividades: number;
  oisDesconocidas: string[];
  cecosDesconocidos: string[];
  rechazos: Array<{ fila: number; motivo: string }>;
}

/** Acá "-" también cuenta como celda vacía (formato de Extra Plan la usa así). */
function textoCelda(valor: ExcelJS.CellValue): string | null {
  return textoCeldaBase(valor, { tratarGuionComoVacio: true });
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
  macroactividad: ["macroactividad", "macro actividad"],
};

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

function etiquetaFy(fy: number): string {
  return `${String(fy % 100).padStart(2, "0")}/${String((fy + 1) % 100).padStart(2, "0")}`;
}

interface Analisis {
  /** Sin id_carga todavía: se asigna al escribir. */
  registros: Array<Omit<RegistroPresupuesto, "id_carga">>;
  /** Fila del Excel y año de cada registro (mismo índice), para la vista previa. */
  origen: Array<{ fila: number; anio: number }>;
  rechazos: Array<{ fila: number; motivo: string }>;
  filasLeidas: number;
  omitidasEnCero: number;
  oisDesconocidas: Set<string>;
  cecosDesconocidos: Set<string>;
  /** Para la vista previa: código y nombre de cada unidad. */
  nombres: Map<string, { unidad: string; tipo: "oi" | "ceco"; nombre: string | null }>;
}

async function analizar(
  cliente: Cliente,
  buffer: Buffer,
  tipo: TipoPresupuesto,
): Promise<Analisis> {
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

  const faltantes = (["mes", "monto"] as const).filter((c) => columna(c) === undefined);
  if (columna("oi") === undefined && columna("ceco") === undefined) {
    faltantes.unshift("oi" as never);
  }
  if (faltantes.length > 0) {
    throw new Error(
      `Faltan columnas obligatorias (${faltantes.join(", ")}). ` +
        `Se esperaba al menos "Nueva Orden" (o "Centro de Costo"), "Mes" y "$Presupuesto". ` +
        `Encabezados leídos: ${[...indice.keys()].join(" | ")}`,
    );
  }

  // Maestras: la OI deduce CeCo y Hunting Zone; el CeCo, las líneas sin orden.
  const [ois, cecos] = await Promise.all([
    cliente.from("ordenes_internas").select("id, codigo_oi, nombre"),
    cliente.from("cecos").select("id, codigo_sap, nombre"),
  ]);
  if (ois.error) throw new Error(`Leyendo órdenes internas: ${ois.error.message}`);
  if (cecos.error) throw new Error(`Leyendo centros de costo: ${cecos.error.message}`);

  const oiPorCodigo = new Map(
    (ois.data ?? []).map((o) => [
      String(o.codigo_oi).trim().toUpperCase(),
      { id: o.id as string, codigo: o.codigo_oi as string, nombre: o.nombre as string | null },
    ]),
  );
  const cecoPorCodigo = new Map(
    (cecos.data ?? []).map((c) => [
      String(c.codigo_sap).trim().toUpperCase(),
      { id: c.id as string, codigo: c.codigo_sap as string, nombre: c.nombre as string | null },
    ]),
  );

  const a: Analisis = {
    registros: [],
    origen: [],
    rechazos: [],
    filasLeidas: 0,
    omitidasEnCero: 0,
    oisDesconocidas: new Set(),
    cecosDesconocidos: new Set(),
    nombres: new Map(),
  };

  hoja.eachRow({ includeEmpty: false }, (row, numero) => {
    if (numero === 1) return;

    const valor = (campo: keyof typeof ALIAS): ExcelJS.CellValue => {
      const c = columna(campo);
      return c === undefined ? null : row.getCell(c).value;
    };

    // "0" en la columna de orden es como vacío: el formato de carga por CeCo
    // la deja así.
    const oiCrudo = textoCelda(valor("oi"));
    const codigoOi = oiCrudo === "0" ? null : oiCrudo;
    const codigoCeco = textoCelda(valor("ceco"));
    const monto = montoCelda(valor("monto"));
    const periodo = periodoCelda(valor("mes"));

    // Fila vacía o de totales: sin unidad y sin monto no aporta nada.
    if (codigoOi === null && codigoCeco === null && monto === null) return;

    a.filasLeidas += 1;

    if (monto === null) {
      a.rechazos.push({ fila: numero, motivo: "Sin monto presupuestado" });
      return;
    }
    // Las planillas traen la grilla completa de meses: las celdas en 0 no son líneas.
    if (monto === 0) {
      a.omitidasEnCero += 1;
      return;
    }
    if (periodo === null) {
      a.rechazos.push({ fila: numero, motivo: "Mes vacío o ilegible" });
      return;
    }

    let idOi: string | null = null;
    let idCeco: string | null = null;
    if (codigoOi !== null) {
      const oi = oiPorCodigo.get(codigoOi.toUpperCase());
      if (!oi) {
        a.oisDesconocidas.add(codigoOi);
        a.rechazos.push({
          fila: numero,
          motivo: `La Orden Interna "${codigoOi}" no existe en la maestra: cárgala antes de reintentar`,
        });
        return;
      }
      idOi = oi.id;
      a.nombres.set(oi.id, { unidad: oi.codigo, tipo: "oi", nombre: oi.nombre });
    } else if (codigoCeco !== null) {
      const ceco = cecoPorCodigo.get(codigoCeco.toUpperCase());
      if (!ceco) {
        a.cecosDesconocidos.add(codigoCeco);
        a.rechazos.push({
          fila: numero,
          motivo: `El Centro de Costo "${codigoCeco}" no existe en la maestra: cárgalo antes de reintentar`,
        });
        return;
      }
      idCeco = ceco.id;
      a.nombres.set(ceco.id, { unidad: ceco.codigo, tipo: "ceco", nombre: ceco.nombre });
    } else {
      a.rechazos.push({ fila: numero, motivo: "Sin Orden Interna ni Centro de Costo" });
      return;
    }

    const cuenta = repartirCuenta(textoCelda(valor("cuentaA")), textoCelda(valor("cuentaB")));

    a.origen.push({ fila: numero, anio: periodo.anio });
    a.registros.push({
      id_oi: idOi,
      id_ceco: idCeco,
      tipo,
      // Fecha LOCAL: fyDeFecha lee getMonth(), y un Date.UTC del día 1 cae el
      // día anterior en cualquier huso al oeste de Greenwich (octubre → FY previo).
      fy: fyDeFecha(new Date(periodo.anio, periodo.mes - 1, 1)),
      mes: periodo.mes,
      quarter: textoCelda(valor("quarter")),
      monto,
      cuenta_contable: cuenta.numero,
      descripcion_cuenta: cuenta.descripcion,
      tipo_gasto: textoCelda(valor("tipoGasto")),
      detalle_gasto: textoCelda(valor("detalleGasto")),
      responsable: textoCelda(valor("responsable")),
      area: textoCelda(valor("area")),
      ceco_declarado: codigoCeco,
      macroactividad: textoCelda(valor("macroactividad")),
    });
  });

  return a;
}

function totalesPorFy(
  registros: Analisis["registros"],
): ResumenCargaPresupuesto["porFy"] {
  const acumulado = new Map<number, { monto: number; filas: number }>();
  for (const r of registros) {
    const previo = acumulado.get(r.fy) ?? { monto: 0, filas: 0 };
    acumulado.set(r.fy, { monto: previo.monto + r.monto, filas: previo.filas + 1 });
  }
  return [...acumulado.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([fy, v]) => ({ fy, etiqueta: etiquetaFy(fy), monto: v.monto, filas: v.filas }));
}

/** Vista previa: lo que se cargaría, sin escribir nada. */
export async function analizarPresupuestoExcel(
  cliente: Cliente,
  buffer: Buffer,
  opciones: { nombreArchivo: string; tipo: TipoPresupuesto },
): Promise<PreviaPresupuesto> {
  const a = await analizar(cliente, buffer, opciones.tipo);

  const porUnidad = new Map<string, UnidadPrevia>();
  for (const [i, r] of a.registros.entries()) {
    const clave = (r.id_oi ?? r.id_ceco) as string;
    const info = a.nombres.get(clave);
    const u = porUnidad.get(clave) ?? {
      unidad: info?.unidad ?? "—",
      tipo: info?.tipo ?? "oi",
      nombre: info?.nombre ?? null,
      lineas: 0,
      monto: 0,
      conMacroactividad: 0,
      lineasDetalle: [],
    };
    u.lineas += 1;
    u.lineasDetalle.push({
      fila: a.origen[i].fila,
      periodo: `${a.origen[i].anio}-${String(r.mes).padStart(2, "0")}`,
      cuenta: r.cuenta_contable,
      detalle: r.detalle_gasto,
      macroactividad: r.macroactividad,
      responsable: r.responsable,
      monto: r.monto,
    });
    u.monto += r.monto;
    if (r.macroactividad) u.conMacroactividad += 1;
    porUnidad.set(clave, u);
  }

  return {
    nombreArchivo: opciones.nombreArchivo,
    filasLeidas: a.filasLeidas,
    lineas: a.registros.length,
    omitidasEnCero: a.omitidasEnCero,
    montoTotal: a.registros.reduce((s, r) => s + r.monto, 0),
    porFy: totalesPorFy(a.registros),
    porUnidad: [...porUnidad.values()].sort((x, y) => y.monto - x.monto),
    macroactividades: new Set(a.registros.flatMap((r) => (r.macroactividad ? [r.macroactividad] : [])))
      .size,
    oisDesconocidas: [...a.oisDesconocidas],
    cecosDesconocidos: [...a.cecosDesconocidos],
    rechazos: a.rechazos.slice(0, 50),
  };
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
  const a = await analizar(cliente, buffer, opciones.tipo);
  const { rechazos, filasLeidas, oisDesconocidas } = a;

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

  const registros: RegistroPresupuesto[] = a.registros.map((r) => ({ ...r, id_carga: idCarga }));

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

  const montoTotal = registros.reduce((s, r) => s + Number(r.monto), 0);

  await cliente
    .from("cargas")
    .update({
      estado: "completada",
      filas_leidas: filasLeidas,
      filas_insertadas: insertadas,
      filas_rechazadas: rechazos.length,
      mensaje:
        [
          oisDesconocidas.size > 0
            ? `Órdenes internas fuera de la maestra: ${[...oisDesconocidas].join(", ")}`
            : null,
          a.cecosDesconocidos.size > 0
            ? `Centros de costo fuera de la maestra: ${[...a.cecosDesconocidos].join(", ")}`
            : null,
          a.omitidasEnCero > 0 ? `${a.omitidasEnCero} líneas en 0 omitidas` : null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
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
    porFy: totalesPorFy(a.registros),
    oisDesconocidas: [...oisDesconocidas],
    rechazos: rechazos.slice(0, 20),
  };
}
