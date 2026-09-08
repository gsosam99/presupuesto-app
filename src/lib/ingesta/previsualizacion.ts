/**
 * Previsualización de una carga de SAP: parsea, cruza contra lo ya cargado y
 * devuelve el resumen SIN ESCRIBIR NADA.
 *
 * Existe porque los exportables de SAP casi nunca contienen sólo el mes que
 * uno pidió: arrastran asientos viejos que recién ahora se aprobaron o
 * pagaron. Sin este paso, la única forma de enterarse de que un archivo traía
 * cinco meses —tres de ellos ya cargados— era mirar los totales después.
 */

import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  cargarIndiceExistentes,
  clasificarDuplicado,
  type EstadoDuplicado,
} from "@/lib/ingesta/duplicados";
import { fyDeFecha } from "@/lib/fiscal";
import { parsearArchivoSap, type LayoutSap, type ResultadoSap } from "@/lib/sap/parser";
import type { Database } from "@/types/supabase";

type Cliente = SupabaseClient<Database>;

export interface MesPrevio {
  /** "2026-08" */
  mes: string;
  fy: number;
  nuevas: number;
  exactas: number;
  probables: number;
  /** Monto Real de las filas NUEVAS: lo que realmente entraría. */
  monto: number;
}

export interface ArchivoPrevio {
  nombreArchivo: string;
  hashArchivo: string;
  /** Null cuando el archivo no se pudo parsear; entonces `error` explica por qué. */
  layout: LayoutSap | null;
  error: string | null;
  filasLeidas: number;
  filasSubtotal: number;
  descartadas: number;
  totalDeclarado: number | null;
  deltaTotal: number | null;
  /** El delta entra en la tolerancia de redondeo de SAP. */
  cuadra: boolean;
  fechaMin: string | null;
  fechaMax: string | null;
  nuevas: number;
  exactas: number;
  probables: number;
  meses: MesPrevio[];
  /** Fecha en que este mismo binario ya se procesó, si pasó. */
  yaCargadoEl: string | null;
}

/** FY de una fecha ISO, sin que la zona horaria mueva el día. */
function fyDeIso(iso: string): number {
  const [a, m, d] = iso.split("-").map(Number);
  return fyDeFecha(new Date(a, m - 1, d));
}

/**
 * SAP totaliza sin redondear y muestra cada línea redondeada a 2 decimales:
 * la deriva máxima es de medio centavo por línea.
 */
function tolerancia(filas: number): number {
  return Math.max(0.02, 0.005 * filas);
}

/** Un archivo parseado, o el motivo por el que no se pudo. */
type Parseado =
  | { nombre: string; hashArchivo: string; ok: true; resultado: ResultadoSap }
  | { nombre: string; hashArchivo: string; ok: false; error: string };

export async function previsualizarArchivos(
  cliente: Cliente,
  archivos: Array<{ nombre: string; buffer: Buffer }>,
): Promise<ArchivoPrevio[]> {
  // --- 1. Parseo (puro, sin tocar la base) ---------------------------------
  const parseados: Parseado[] = archivos.map((a) => {
    const hashArchivo = createHash("sha256").update(a.buffer).digest("hex");
    try {
      return {
        nombre: a.nombre,
        hashArchivo,
        ok: true,
        resultado: parsearArchivoSap(a.buffer, a.nombre),
      };
    } catch (e) {
      return {
        nombre: a.nombre,
        hashArchivo,
        ok: false,
        error: e instanceof Error ? e.message : "Error desconocido al procesar",
      };
    }
  });

  // --- 2. Un solo índice para todos los archivos ---------------------------
  const fechas = parseados
    .flatMap((p) => (p.ok ? p.resultado.filas.map((f) => f.fecha) : []))
    .sort();

  const indice =
    fechas.length > 0
      ? await cargarIndiceExistentes(cliente, fechas[0], fechas[fechas.length - 1])
      : { hashes: new Set<string>(), probables: new Set<string>() };

  // --- 3. ¿Alguno de estos binarios ya se procesó? -------------------------
  const hashes = parseados.map((p) => p.hashArchivo);
  const { data: previas } = await cliente
    .from("cargas")
    .select("hash_archivo, created_at")
    .in("hash_archivo", hashes)
    .eq("estado", "completada");

  const cargadoPorHash = new Map(
    ((previas ?? []) as Array<{ hash_archivo: string; created_at: string }>).map((c) => [
      c.hash_archivo,
      c.created_at,
    ]),
  );

  // --- 4. Resumen por archivo y por mes ------------------------------------
  return parseados.map((p): ArchivoPrevio => {
    const base = {
      nombreArchivo: p.nombre,
      hashArchivo: p.hashArchivo,
      yaCargadoEl: cargadoPorHash.get(p.hashArchivo) ?? null,
    };

    if (!p.ok) {
      return {
        ...base,
        layout: null,
        error: p.error,
        filasLeidas: 0,
        filasSubtotal: 0,
        descartadas: 0,
        totalDeclarado: null,
        deltaTotal: null,
        cuadra: false,
        fechaMin: null,
        fechaMax: null,
        nuevas: 0,
        exactas: 0,
        probables: 0,
        meses: [],
      };
    }

    const r = p.resultado;
    const porMes = new Map<string, MesPrevio>();
    let nuevas = 0;
    let exactas = 0;
    let probables = 0;

    for (const f of r.filas) {
      const estado: EstadoDuplicado = clasificarDuplicado(
        {
          proveedor: f.proveedor,
          factura: f.factura,
          textoReferencia: f.textoReferencia,
          fecha: f.fecha,
          montoReal: f.montoReal,
        },
        indice,
      );

      const mes = f.fecha.slice(0, 7);
      const acc =
        porMes.get(mes) ??
        { mes, fy: fyDeIso(f.fecha), nuevas: 0, exactas: 0, probables: 0, monto: 0 };

      if (estado === "exacta") {
        exactas += 1;
        acc.exactas += 1;
      } else if (estado === "probable") {
        probables += 1;
        acc.probables += 1;
      } else {
        nuevas += 1;
        acc.nuevas += 1;
        acc.monto += f.montoReal;
      }

      porMes.set(mes, acc);
    }

    const suma = r.filas.reduce((s, f) => s + f.montoReal, 0);
    const delta = r.totalDeclarado === null ? null : Math.abs(suma - r.totalDeclarado);
    const fechasArchivo = r.filas.map((f) => f.fecha).sort();

    return {
      ...base,
      layout: r.layout,
      error: null,
      filasLeidas: r.filasLeidas,
      filasSubtotal: r.filasSubtotal,
      descartadas: r.rechazos.length,
      totalDeclarado: r.totalDeclarado,
      deltaTotal: delta,
      cuadra: delta === null || delta <= tolerancia(r.filas.length),
      fechaMin: fechasArchivo[0] ?? null,
      fechaMax: fechasArchivo[fechasArchivo.length - 1] ?? null,
      nuevas,
      exactas,
      probables,
      meses: [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes)),
    };
  });
}
