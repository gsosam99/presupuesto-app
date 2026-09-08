/**
 * Respaldo completo de la tabla de gastos a CSV.
 *
 * Une v_gastos_enriquecidos (que ya trae los nombres de CeCo, OI y Hunting
 * Zone) con las columnas crudas que la vista no expone —fuente, id_carga,
 * montos de plan/comprometido y el rastro de revisión— para que el archivo
 * sirva como respaldo fiel y no sólo como reporte de lectura.
 *
 * Formato: CSV estándar (RFC 4180) — separador coma, decimales con punto,
 * fechas ISO y UTF-8 con BOM. Abre bien en Google Sheets y LibreOffice. En
 * Excel en español conviene entrar por Datos > Obtener datos > Desde archivo
 * de texto/CSV y elegir "Inglés (Estados Unidos)" como origen, para que no
 * interprete los puntos decimales como separadores de miles.
 *
 * Uso:
 *   npm run exportar:gastos
 *   npm run exportar:gastos -- ruta/salida.csv
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/types/supabase";

const PASO = 1000;

/** Columnas del CSV, en orden, y de dónde sale cada una. */
const COLUMNAS = [
  "id",
  "fecha_documento",
  "fy",
  "fy_etiqueta",
  "mes",
  "factura",
  "proveedor_codigo",
  "proveedor",
  "texto_referencia",
  "grupo_clase_coste",
  "monto_real",
  "monto_plan_sap",
  "monto_comprometido",
  "ceco_codigo",
  "ceco_nombre",
  "codigo_oi",
  "oi_nombre",
  "hunting_zone",
  "tag_principal",
  "fase",
  "motivo",
  "detalle",
  "estado_revision",
  "origen_hz",
  "nota",
  "factura_preregistrada",
  "oi_codigo_raw",
  "ceco_codigo_raw",
  "fuente",
  "id_carga",
  "hash_dedupe",
  "revisado_at",
  "created_at",
  "updated_at",
] as const;

type Fila = Record<string, unknown>;

/** Trae una tabla o vista completa, paginando. */
async function traerTodo(
  cliente: ReturnType<typeof createClient<Database>>,
  origen: string,
  columnas: string,
): Promise<Fila[]> {
  const salida: Fila[] = [];

  for (let desde = 0; ; desde += PASO) {
    const { data, error } = await cliente
      .from(origen)
      .select(columnas)
      .order("fecha_documento", { ascending: true })
      .range(desde, desde + PASO - 1);

    if (error) throw new Error(`Leyendo ${origen}: ${error.message}`);

    const filas = (data ?? []) as unknown as Fila[];
    salida.push(...filas);
    if (filas.length < PASO) break;
  }

  return salida;
}

/** Escapa un valor según RFC 4180. */
function celda(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  const s = String(valor);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  }

  const cliente = createClient<Database>(url, key, { auth: { persistSession: false } });

  const hoy = new Date().toISOString().slice(0, 10);
  const destino = resolve(process.argv[2] ?? `respaldos/gastos_${hoy}.csv`);

  console.log("Leyendo gastos…");
  const [enriquecidos, crudos] = await Promise.all([
    traerTodo(cliente, "v_gastos_enriquecidos", "*"),
    traerTodo(
      cliente,
      "gastos",
      "id, monto_plan_sap, monto_comprometido, fuente, id_carga, hash_dedupe, revisado_at, created_at, updated_at",
    ),
  ]);

  const extrasPorId = new Map(crudos.map((g) => [String(g.id), g]));
  const filas = enriquecidos.map((g) => ({ ...g, ...(extrasPorId.get(String(g.id)) ?? {}) }));

  if (filas.length !== crudos.length) {
    console.warn(
      `AVISO: la vista devolvió ${filas.length} filas y la tabla ${crudos.length}. ` +
        `No deberían diferir; revisa antes de confiar en el respaldo.`,
    );
  }

  // --- CSV ------------------------------------------------------------------
  const lineas = [COLUMNAS.join(",")];
  for (const f of filas) lineas.push(COLUMNAS.map((c) => celda(f[c])).join(","));

  mkdirSync(dirname(destino), { recursive: true });
  // BOM para que Excel no rompa los acentos.
  writeFileSync(destino, "﻿" + lineas.join("\r\n") + "\r\n", "utf8");

  // --- Resumen para verificar de un vistazo --------------------------------
  const porEstado = new Map<string, number>();
  const porFy = new Map<string, { n: number; monto: number }>();
  let total = 0;

  for (const f of filas) {
    const e = String(f.estado_revision);
    porEstado.set(e, (porEstado.get(e) ?? 0) + 1);
    const fy = String(f.fy_etiqueta);
    const acc = porFy.get(fy) ?? { n: 0, monto: 0 };
    acc.n += 1;
    acc.monto += Number(f.monto_real ?? 0);
    porFy.set(fy, acc);
    total += Number(f.monto_real ?? 0);
  }

  console.log(`\n${destino}`);
  console.log(`${filas.length} gastos · ${COLUMNAS.length} columnas`);
  console.log(`monto Real total: ${total.toFixed(2)}\n`);

  console.log("por estado:");
  for (const [e, n] of [...porEstado].sort()) console.log(`  ${e.padEnd(12)} ${n}`);

  console.log("\npor año fiscal:");
  for (const [fy, a] of [...porFy].sort()) {
    console.log(`  FY ${fy}  ${String(a.n).padStart(5)} filas  ${a.monto.toFixed(2)}`);
  }
}

main().catch((e: unknown) => {
  console.error("✗", e instanceof Error ? e.message : e);
  process.exit(1);
});
