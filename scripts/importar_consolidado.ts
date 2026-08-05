/**
 * Importador del consolidado histórico de gastos (Fase 1) a Supabase.
 *
 * Mecanismo: el archivo NUNCA pasa por el contexto del modelo. Este script se
 * escribe una sola vez y procesa N filas en streaming, insertando por lotes.
 * El costo en tokens es constante, no proporcional al número de filas.
 *
 * Uso:
 *   node --env-file=.env.local node_modules/.bin/tsx scripts/importar_consolidado.ts <archivo.xlsx> [--dry-run]
 *   npm run importar:consolidado -- <archivo.xlsx> --dry-run
 *
 * Requiere SUPABASE_SERVICE_ROLE_KEY en .env.local (el script corre fuera de
 * una sesión de usuario, así que necesita bypassear RLS).
 *
 * Columnas esperadas (hoja "CONSOLIDADO"):
 *   CeCo | Orden Interna | Nombre Orden Interna |
 *   Número de cuenta proveedor o acreedor | Nombre de Proveedor | Factura |
 *   Texto de Referencia | Fase | Motivo | Detalle | Grupo Clase de Coste |
 *   Fecha de documento | Año Fiscal | Monto (USD2)
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";

import type { Database } from "../src/types/supabase";

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

const LOTE = 500;
const HOJA = "CONSOLIDADO";

type ClienteSupabase = SupabaseClient<Database>;

let cliente: ClienteSupabase | null = null;

/** Cliente perezoso: `--dry-run` no necesita credenciales. */
function db(): ClienteSupabase {
  if (cliente) return cliente;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local.\n" +
        "La service_role key está en Dashboard > Project Settings > API Keys.",
    );
    process.exit(1);
  }

  cliente = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });
  return cliente;
}

// ---------------------------------------------------------------------------
// Normalizadores
// ---------------------------------------------------------------------------

/** Normaliza un header para matchear sin importar acentos, mayúsculas ni espacios. */
function normalizarHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // marcas diacríticas
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Convierte un monto en locale es-VE a número.
 * "4.897,55" -> 4897.55 | "-53.710,00" -> -53710 | 316.46 (celda numérica) -> 316.46
 * Ojo: parseFloat("173,54") devuelve 173 — de ahí este parser.
 */
function parsearMonto(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;

  let s = String(valor).trim().replace(/\s/g, "");
  if (s === "" || s === "#" || s === "-") return null;

  const negativo = s.startsWith("-") || /^\(.*\)$/.test(s);
  s = s.replace(/[()\-]/g, "");

  const tieneComa = s.includes(",");
  const tienePunto = s.includes(".");

  if (tieneComa && tienePunto) {
    // El último separador que aparece es el decimal.
    s = s.lastIndexOf(",") > s.lastIndexOf(".")
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (tieneComa) {
    // "4897,55" decimal | "1,234" ambiguo -> si hay exactamente 3 dígitos
    // después de la coma se asume separador de miles.
    const decimales = s.length - s.lastIndexOf(",") - 1;
    s = decimales === 3 ? s.replace(/,/g, "") : s.replace(",", ".");
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

/** Acepta Date, serial de Excel, "DD.MM.YYYY", "YYYY-MM-DD" y "DD/MM/YYYY". */
function parsearFecha(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === "") return null;

  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return valor.toISOString().slice(0, 10);
  }

  if (typeof valor === "number") {
    // Serial de Excel (base 1899-12-30).
    const ms = (valor - 25569) * 86400 * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  const s = String(valor).trim();
  let m = /^(\d{2})[./](\d{2})[./](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;

  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Año fiscal IENN: el ciclo arranca en octubre. Espejo de public.fy_de_fecha(). */
function fyDeFecha(iso: string): number {
  const [anio, mes] = iso.split("-").map(Number);
  return anio - (mes >= 10 ? 0 : 1);
}

/** Limpia códigos: "7190000026.0" -> "7190000026", "#" -> null. */
function limpiarCodigo(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const s = String(valor).trim().replace(/\.0$/, "");
  return s === "" || s === "#" || s.toLowerCase() === "nan" ? null : s;
}

function texto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const s = String(valor).trim();
  return s === "" || s === "#" ? null : s;
}

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------

interface FilaConsolidado {
  fila: number;
  ceco: string | null;
  codigoOi: string | null;
  nombreOi: string | null;
  proveedorCodigo: string | null;
  proveedor: string | null;
  factura: string | null;
  textoReferencia: string | null;
  fase: string | null;
  motivo: string | null;
  detalle: string | null;
  grupoClaseCoste: string | null;
  fecha: string;
  fyDeclarado: string | null;
  monto: number;
}

/**
 * Correcciones puntuales del catálogo, acordadas con el usuario.
 * La columna "Flag_Revisión_IA" del Excel es material de trabajo de la Fase 1
 * y NO se ingesta: no representa gastos no aprobados.
 */
const CORRECCIONES_TAXONOMIA: Record<string, string> = {
  Labratorio: "Laboratorio",
};

function corregirTaxonomia(valor: string | null): string | null {
  return valor === null ? null : (CORRECCIONES_TAXONOMIA[valor] ?? valor);
}

/** Valor serializable a jsonb para la columna cargas_rechazos.payload. */
type ValorJson = string | number | null;

function aJson(valor: unknown): ValorJson {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number" || typeof valor === "string") return valor;
  if (valor instanceof Date) return valor.toISOString();
  return String(valor);
}

interface Rechazo {
  fila: number;
  motivo: string;
  payload: Record<string, ValorJson>;
}

const COLUMNAS: Record<keyof Omit<FilaConsolidado, "fila">, string[]> = {
  ceco: ["ceco"],
  codigoOi: ["ordeninterna"],
  nombreOi: ["nombreordeninterna"],
  proveedorCodigo: ["numerodecuentaproveedoroacreedor", "numerodecuentaproveedor"],
  proveedor: ["nombredeproveedor", "nombreproveedor"],
  factura: ["factura"],
  textoReferencia: ["textodereferencia"],
  fase: ["fase"],
  motivo: ["motivo"],
  detalle: ["detalle"],
  grupoClaseCoste: ["grupoclasedecoste"],
  fecha: ["fechadedocumento", "fechadocumento"],
  fyDeclarado: ["anofiscal", "aofiscal"],
  monto: ["montousd2", "monto"],
};

// ---------------------------------------------------------------------------
// Lectura del archivo
// ---------------------------------------------------------------------------

/** Par OI -> Hunting Zone declarado en la hoja maestra del workbook. */
interface ParOiHz {
  codigo: string;
  hz: string;
}

/**
 * Lee la hoja "Ordenes Internas" (maestra declarativa). Es la fuente de verdad:
 * incluye OIs que todavía no tienen gastos pero a las que un presupuesto sí
 * puede apuntar. Sin esto, el Flujo B rechazaría esas OIs.
 */
function leerHojaMaestraOi(wb: ExcelJS.Workbook): ParOiHz[] {
  const hoja = wb.worksheets.find((h) => normalizarHeader(h.name) === "ordenesinternas");
  if (!hoja) return [];

  const pares: ParOiHz[] = [];
  hoja.eachRow({ includeEmpty: false }, (row, numero) => {
    if (numero === 1) return;
    const codigo = limpiarCodigo(row.getCell(1).value);
    const hz = texto(row.getCell(2).value);
    if (codigo && hz) pares.push({ codigo, hz });
  });
  return pares;
}

async function leerArchivo(ruta: string): Promise<{
  filas: FilaConsolidado[];
  rechazos: Rechazo[];
  leidas: number;
  maestraOi: ParOiHz[];
}> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(ruta);

  const maestraOi = leerHojaMaestraOi(wb);

  const hoja = wb.getWorksheet(HOJA) ?? wb.worksheets[0];
  if (!hoja) throw new Error(`No se encontró la hoja "${HOJA}" ni ninguna otra.`);

  // Mapear headers -> índice de columna
  const indice = new Map<string, number>();
  hoja.getRow(1).eachCell((cell, col) => {
    indice.set(normalizarHeader(String(cell.value ?? "")), col);
  });

  const col = (campo: keyof typeof COLUMNAS): number | undefined => {
    for (const alias of COLUMNAS[campo]) {
      const c = indice.get(alias);
      if (c !== undefined) return c;
    }
    return undefined;
  };

  const faltantes = (["codigoOi", "fecha", "monto"] as const).filter(
    (c) => col(c) === undefined,
  );
  if (faltantes.length > 0) {
    throw new Error(
      `Faltan columnas obligatorias: ${faltantes.join(", ")}.\n` +
        `Headers detectados: ${[...indice.keys()].join(", ")}`,
    );
  }

  const valor = (row: ExcelJS.Row, campo: keyof typeof COLUMNAS): unknown => {
    const c = col(campo);
    if (c === undefined) return null;
    const v = row.getCell(c).value;
    // Celdas con fórmula devuelven { result }
    if (v && typeof v === "object" && "result" in v) {
      return (v as { result: unknown }).result;
    }
    if (v && typeof v === "object" && "text" in v) {
      return (v as { text: unknown }).text;
    }
    return v;
  };

  const filas: FilaConsolidado[] = [];
  const rechazos: Rechazo[] = [];
  let leidas = 0;

  hoja.eachRow({ includeEmpty: false }, (row, numero) => {
    if (numero === 1) return;
    leidas += 1;

    const fecha = parsearFecha(valor(row, "fecha"));
    const monto = parsearMonto(valor(row, "monto"));

    const crudo: Record<string, ValorJson> = {
      ceco: aJson(valor(row, "ceco")),
      orden: aJson(valor(row, "codigoOi")),
      fecha: aJson(valor(row, "fecha")),
      monto: aJson(valor(row, "monto")),
    };

    if (!fecha) {
      rechazos.push({ fila: numero, motivo: "Fecha inválida o vacía", payload: crudo });
      return;
    }
    if (monto === null) {
      rechazos.push({ fila: numero, motivo: "Monto inválido o vacío", payload: crudo });
      return;
    }

    filas.push({
      fila: numero,
      ceco: limpiarCodigo(valor(row, "ceco")),
      codigoOi: limpiarCodigo(valor(row, "codigoOi")),
      nombreOi: texto(valor(row, "nombreOi")),
      proveedorCodigo: limpiarCodigo(valor(row, "proveedorCodigo")),
      proveedor: texto(valor(row, "proveedor")),
      factura: texto(valor(row, "factura")),
      textoReferencia: texto(valor(row, "textoReferencia")),
      fase: corregirTaxonomia(texto(valor(row, "fase"))),
      motivo: corregirTaxonomia(texto(valor(row, "motivo"))),
      detalle: corregirTaxonomia(texto(valor(row, "detalle"))),
      grupoClaseCoste: texto(valor(row, "grupoClaseCoste")),
      fecha,
      fyDeclarado: texto(valor(row, "fyDeclarado")),
      monto,
    });
  });

  return { filas, rechazos, leidas, maestraOi };
}

// ---------------------------------------------------------------------------
// Derivación de maestras desde el propio archivo
// ---------------------------------------------------------------------------

async function sincronizarMaestras(filas: FilaConsolidado[], maestraOi: ParOiHz[]) {
  // --- CeCos --------------------------------------------------------------
  const cecos = [...new Set(filas.map((f) => f.ceco).filter((c): c is string => !!c))];
  if (cecos.length > 0) {
    const { error } = await db()
      .from("cecos")
      .upsert(
        cecos.map((c) => ({ codigo_sap: c, nombre: `CeCo ${c}` })),
        { onConflict: "codigo_sap", ignoreDuplicates: true },
      );
    if (error) throw new Error(`Upsert cecos: ${error.message}`);
  }

  // --- Hunting Zones (el nombre de la OI ES la Hunting Zone) ---------------
  // Se unen las vistas en gastos y las declaradas en la hoja maestra, que
  // incluye zonas todavía sin ejecución.
  const hzs = [
    ...new Set([
      ...filas.map((f) => f.nombreOi).filter((h): h is string => !!h),
      ...maestraOi.map((p) => p.hz),
    ]),
  ].filter((h) => h.toLowerCase() !== "(sin asignar)");
  if (hzs.length > 0) {
    const { error } = await db()
      .from("hunting_zones")
      .upsert(
        hzs.map((h, i) => ({ nombre: h, orden_display: (i + 1) * 10 })),
        { onConflict: "nombre", ignoreDuplicates: true },
      );
    if (error) throw new Error(`Upsert hunting_zones: ${error.message}`);
  }

  const { data: hzRows, error: eHz } = await db()
    .from("hunting_zones")
    .select("id, nombre");
  if (eHz) throw new Error(`Select hunting_zones: ${eHz.message}`);
  const hzPorNombre = new Map(hzRows!.map((r) => [r.nombre as string, r.id as string]));

  const { data: cecoRows, error: eCeco } = await db()
    .from("cecos")
    .select("id, codigo_sap");
  if (eCeco) throw new Error(`Select cecos: ${eCeco.message}`);
  const cecoPorCodigo = new Map(
    cecoRows!.map((r) => [r.codigo_sap as string, r.id as string]),
  );

  // --- Tags: los códigos que empiezan con '#' son etiquetas manuales -------
  const tags = new Map<string, string>();
  for (const f of filas) {
    if (f.codigoOi?.startsWith("#") && f.nombreOi) tags.set(f.codigoOi, f.nombreOi);
  }
  for (const p of maestraOi) {
    if (p.codigo.startsWith("#")) tags.set(p.codigo, p.hz);
  }
  if (tags.size > 0) {
    const payload = [...tags.entries()]
      .filter(([, hz]) => hzPorNombre.has(hz))
      .map(([tag, hz]) => ({
        tag,
        id_hunting_zone: hzPorNombre.get(hz)!,
        prioridad: 100 - tag.length,
      }));
    const { error } = await db()
      .from("hunting_zone_tags")
      .upsert(payload, { onConflict: "tag", ignoreDuplicates: true });
    if (error) throw new Error(`Upsert hunting_zone_tags: ${error.message}`);
  }

  // --- Órdenes Internas ----------------------------------------------------
  const ois = new Map<string, { nombre: string | null; ceco: string | null }>();
  // Primero la hoja maestra: registra OIs sin gastos (a las que sí puede
  // apuntar un presupuesto). Los gastos luego enriquecen CeCo y nombre.
  for (const p of maestraOi) {
    if (p.hz.toLowerCase() === "(sin asignar)") continue;
    ois.set(p.codigo, { nombre: p.hz, ceco: null });
  }
  for (const f of filas) {
    if (!f.codigoOi) continue;
    const previo = ois.get(f.codigoOi);
    ois.set(f.codigoOi, {
      nombre: f.nombreOi ?? previo?.nombre ?? null,
      ceco: f.ceco ?? previo?.ceco ?? null,
    });
  }
  if (ois.size > 0) {
    const payload = [...ois.entries()].map(([codigo, info]) => ({
      codigo_oi: codigo,
      nombre: info.nombre,
      id_ceco: info.ceco ? (cecoPorCodigo.get(info.ceco) ?? null) : null,
      id_hunting_zone: info.nombre ? (hzPorNombre.get(info.nombre) ?? null) : null,
    }));
    const { error } = await db()
      .from("ordenes_internas")
      .upsert(payload, { onConflict: "codigo_oi", ignoreDuplicates: false });
    if (error) throw new Error(`Upsert ordenes_internas: ${error.message}`);
  }

  // --- Taxonomía -----------------------------------------------------------
  const tax = new Map<string, { fase: string; motivo: string; detalle: string }>();
  for (const f of filas) {
    if (f.fase && f.motivo && f.detalle) {
      tax.set(`${f.fase}|${f.motivo}|${f.detalle}`, {
        fase: f.fase,
        motivo: f.motivo,
        detalle: f.detalle,
      });
    }
  }
  if (tax.size > 0) {
    const { error } = await db()
      .from("taxonomias")
      .upsert([...tax.values()], {
        onConflict: "fase,motivo,detalle",
        ignoreDuplicates: true,
      });
    if (error) throw new Error(`Upsert taxonomias: ${error.message}`);
  }

  const { data: oiRows } = await db()
    .from("ordenes_internas")
    .select("id, codigo_oi, id_ceco, id_hunting_zone");
  const { data: taxRows } = await db()
    .from("taxonomias")
    .select("id, fase, motivo, detalle");

  return {
    cecoPorCodigo,
    hzPorNombre,
    oiPorCodigo: new Map(
      (oiRows ?? []).map((r) => [
        r.codigo_oi as string,
        {
          id: r.id as string,
          idCeco: r.id_ceco as string | null,
          idHz: r.id_hunting_zone as string | null,
        },
      ]),
    ),
    taxPorClave: new Map(
      (taxRows ?? []).map((r) => [`${r.fase}|${r.motivo}|${r.detalle}`, r.id as string]),
    ),
    conteos: { cecos: cecos.length, hzs: hzs.length, ois: ois.size, tax: tax.size },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const ruta = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");

  if (!ruta) {
    console.error("Uso: importar_consolidado.ts <archivo.xlsx> [--dry-run]");
    process.exit(1);
  }

  console.log(`Leyendo ${ruta} ...`);
  const { filas, rechazos, leidas, maestraOi } = await leerArchivo(ruta);
  console.log(`  ${leidas} filas leídas, ${filas.length} válidas, ${rechazos.length} rechazadas`);

  // Chequeo de consistencia del FY declarado vs el calculado.
  const desajustes = filas.filter((f) => {
    if (!f.fyDeclarado) return false;
    const m = /(\d{2})\s*\/\s*(\d{2})/.exec(f.fyDeclarado);
    return m ? 2000 + Number(m[1]) !== fyDeFecha(f.fecha) : false;
  });
  if (desajustes.length > 0) {
    console.warn(
      `  ⚠ ${desajustes.length} filas donde el "Año Fiscal" del Excel no coincide ` +
        `con el FY calculado (oct-sep). Ej. fila ${desajustes[0].fila}: ` +
        `declarado ${desajustes[0].fyDeclarado}, calculado ${fyDeFecha(desajustes[0].fecha)}`,
    );
  }

  if (dryRun) {
    const total = filas.reduce((s, f) => s + f.monto, 0);
    console.log("\n--- DRY RUN (no se escribió nada) ---");
    console.log(`  Monto total: ${total.toFixed(2)}`);
    console.log(`  Rango de fechas: ${filas.map((f) => f.fecha).sort()[0]} .. ${filas.map((f) => f.fecha).sort().at(-1)}`);
    const oisConGasto = new Set(filas.map((f) => f.codigoOi));
    const oisMaestra = new Set(maestraOi.map((p) => p.codigo));
    console.log(`  OIs con gastos: ${oisConGasto.size}`);
    console.log(
      `  OIs en hoja maestra: ${oisMaestra.size} ` +
        `(${[...oisMaestra].filter((c) => !oisConGasto.has(c)).length} sin gastos aún)`,
    );
    console.log(`  Hunting Zones: ${new Set([...filas.map((f) => f.nombreOi), ...maestraOi.map((p) => p.hz)]).size}`);
    const taxCompletas = new Set(
      filas.filter((f) => f.fase && f.motivo && f.detalle).map((f) => `${f.fase}|${f.motivo}|${f.detalle}`),
    );
    const sinTaxonomia = filas.filter((f) => !(f.fase && f.motivo && f.detalle)).length;
    console.log(`  Taxonomías completas: ${taxCompletas.size}`);
    console.log(`  Filas sin taxonomía completa: ${sinTaxonomia}`);

    // Control de integridad contra la tabla dinámica del Excel, que filtra
    // la Hunting Zone "No Aplica".
    const noAplica = filas.filter((f) => f.nombreOi === "No Aplica");
    const montoNoAplica = noAplica.reduce((s, f) => s + f.monto, 0);
    console.log(
      `  "No Aplica": ${noAplica.length} filas por ${montoNoAplica.toFixed(2)} ` +
        `-> total sin esa HZ: ${(total - montoNoAplica).toFixed(2)}`,
    );
    if (rechazos.length > 0) console.log(`  Primer rechazo:`, rechazos[0]);
    return;
  }

  // Registro de auditoría
  const { data: carga, error: eCarga } = await db()
    .from("cargas")
    .insert({
      tipo: "maestras",
      nombre_archivo: ruta.split("/").pop() ?? ruta,
      estado: "procesando",
      filas_leidas: leidas,
    })
    .select("id")
    .single();
  if (eCarga) throw new Error(`Insert cargas: ${eCarga.message}`);
  const idCarga = carga!.id as string;

  console.log("Sincronizando maestras ...");
  const maestras = await sincronizarMaestras(filas, maestraOi);
  console.log(
    `  CeCos ${maestras.conteos.cecos} | HZ ${maestras.conteos.hzs} | ` +
      `OIs ${maestras.conteos.ois} | Taxonomías ${maestras.conteos.tax}`,
  );

  // Armado de los registros de gasto
  const registros = filas.map((f) => {
    const oi = f.codigoOi ? maestras.oiPorCodigo.get(f.codigoOi) : undefined;
    const esTagManual = f.codigoOi?.startsWith("#") ?? false;
    const idTaxonomia =
      maestras.taxPorClave.get(`${f.fase}|${f.motivo}|${f.detalle}`) ?? null;

    return {
      fuente: "manual" as const,
      factura: f.factura,
      fecha_documento: f.fecha,
      proveedor_codigo: f.proveedorCodigo,
      proveedor: f.proveedor,
      texto_referencia: f.textoReferencia,
      grupo_clase_coste: f.grupoClaseCoste,
      ceco_codigo_raw: f.ceco,
      oi_codigo_raw: f.codigoOi,
      monto_real: f.monto,
      id_ceco: f.ceco ? (maestras.cecoPorCodigo.get(f.ceco) ?? null) : (oi?.idCeco ?? null),
      id_oi: oi?.id ?? null,
      id_hunting_zone:
        oi?.idHz ?? (f.nombreOi ? (maestras.hzPorNombre.get(f.nombreOi) ?? null) : null),
      id_taxonomia: idTaxonomia,
      origen_hz: esTagManual ? ("manual" as const) : ("orden_interna" as const),
      // Histórico ya curado en Fase 1: entra aprobado. `nota` queda libre para
      // que el usuario escriba observaciones desde la app.
      estado_revision: "aprobado" as const,
      id_carga: idCarga,
    };
  });

  const sinTaxonomia = registros.filter((r) => r.id_taxonomia === null).length;
  console.log(`  ${registros.length} aprobadas (${sinTaxonomia} sin taxonomía completa)`);

  let insertadas = 0;
  let duplicadas = 0;

  for (let i = 0; i < registros.length; i += LOTE) {
    const lote = registros.slice(i, i + LOTE);
    const { data, error } = await db()
      .from("gastos")
      .upsert(lote, { onConflict: "hash_dedupe", ignoreDuplicates: true })
      .select("id");

    if (error) {
      // Fallback fila por fila para aislar el problema sin abortar la carga.
      console.warn(`  Lote ${i / LOTE + 1} falló (${error.message}); reintentando fila a fila`);
      for (const [j, r] of lote.entries()) {
        const { error: e1 } = await db()
          .from("gastos")
          .upsert([r], { onConflict: "hash_dedupe", ignoreDuplicates: true });
        if (e1) {
          if (e1.code === "23505") duplicadas += 1;
          else {
            rechazos.push({
              fila: filas[i + j].fila,
              motivo: e1.message,
              payload: { factura: r.factura, fecha: r.fecha_documento, monto: r.monto_real },
            });
          }
        } else insertadas += 1;
      }
    } else {
      insertadas += data?.length ?? 0;
      duplicadas += lote.length - (data?.length ?? 0);
    }

    console.log(`  ${Math.min(i + LOTE, registros.length)}/${registros.length}`);
  }

  if (rechazos.length > 0) {
    const { error } = await db().from("cargas_rechazos").insert(
      rechazos.map((r) => ({
        id_carga: idCarga,
        fila: r.fila,
        motivo: r.motivo,
        payload: r.payload,
      })),
    );
    if (error) console.warn(`No se pudieron guardar los rechazos: ${error.message}`);
  }

  await db()
    .from("cargas")
    .update({
      estado: "completada",
      filas_insertadas: insertadas,
      filas_duplicadas: duplicadas,
      filas_rechazadas: rechazos.length,
      finalizada_at: new Date().toISOString(),
    })
    .eq("id", idCarga);

  console.log("\n--- Resumen ---");
  console.log(`  Leídas:     ${leidas}`);
  console.log(`  Insertadas: ${insertadas}`);
  console.log(`  Duplicadas: ${duplicadas}`);
  console.log(`  Rechazadas: ${rechazos.length}`);
  console.log(`  Carga id:   ${idCarga}`);
}

main().catch((e: unknown) => {
  console.error("\n✗ Falló la importación:", e instanceof Error ? e.message : e);
  process.exit(1);
});
