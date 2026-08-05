/**
 * Recupera Fase / Motivo / Detalle parciales del consolidado histórico.
 *
 * Cuando la taxonomía era una tabla de combinaciones cerradas, las filas con
 * solo uno o dos de los tres campos no podían representarse y se guardaron en
 * blanco. Ahora que son campos independientes, este script recompone esos
 * valores desde el Excel original.
 *
 * El cruce usa la MISMA clave de deduplicación que la base (hash_dedupe), así
 * que no depende del orden de las filas ni de ids.
 *
 * Uso: npm run recuperar:taxonomia -- "<consolidado.xlsx>" [--dry-run]
 */

import { createHash } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";

import type { Database } from "../src/types/supabase";

const ruta = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

function texto(valor: ExcelJS.CellValue): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "object") {
    if ("result" in valor) return texto((valor as { result: ExcelJS.CellValue }).result);
    if ("text" in valor) return String((valor as { text: unknown }).text).trim() || null;
    return null;
  }
  const s = String(valor).trim();
  return s === "" || s === "#" ? null : s;
}

/** Espejo exacto de la columna generada gastos.hash_dedupe. */
function hashDedupe(
  proveedor: string | null,
  factura: string | null,
  textoRef: string | null,
  fechaIso: string,
  monto: number,
): string {
  const dias = Math.round(
    (Date.UTC(
      Number(fechaIso.slice(0, 4)),
      Number(fechaIso.slice(5, 7)) - 1,
      Number(fechaIso.slice(8, 10)),
    ) -
      Date.UTC(1970, 0, 1)) /
      86400000,
  );
  const centavos = Math.round(monto * 100);
  const partes = [
    (proveedor ?? "").trim().toUpperCase(),
    (factura ?? "").trim(),
    (textoRef ?? "").trim().toUpperCase(),
    String(dias),
    String(centavos),
  ];
  return createHash("md5").update(partes.join("|")).digest("hex");
}

function fechaIso(valor: ExcelJS.CellValue): string | null {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return valor.toISOString().slice(0, 10);
  }
  const s = texto(valor);
  if (s === null) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(s);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

async function main(): Promise<void> {
  if (!ruta) {
    console.error("Uso: recuperar_taxonomia_parcial.ts <consolidado.xlsx> [--dry-run]");
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(ruta);
  const hoja = wb.getWorksheet("CONSOLIDADO") ?? wb.worksheets[0];
  if (!hoja) throw new Error("No se encontró la hoja CONSOLIDADO");

  const col = new Map<string, number>();
  hoja.getRow(1).eachCell((cell, c) => {
    col.set(
      String(cell.value ?? "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .trim()
        .toLowerCase(),
      c,
    );
  });

  const idx = (nombre: string) => col.get(nombre);
  const cProv = idx("nombre de proveedor");
  const cFact = idx("factura");
  const cTexto = idx("texto de referencia");
  const cFecha = idx("fecha de documento");
  const cMonto = idx("monto (usd2)");
  const cFase = idx("fase");
  const cMotivo = idx("motivo");
  const cDetalle = idx("detalle");

  if (!cFecha || !cMonto) throw new Error("Faltan columnas de fecha o monto");

  // Solo interesan las filas con taxonomía INCOMPLETA: las completas ya están.
  const parciales = new Map<string, { fase: string | null; motivo: string | null; detalle: string | null }>();

  hoja.eachRow({ includeEmpty: false }, (row, numero) => {
    if (numero === 1) return;

    const fase = cFase ? texto(row.getCell(cFase).value) : null;
    const motivo = cMotivo ? texto(row.getCell(cMotivo).value) : null;
    const detalle = cDetalle ? texto(row.getCell(cDetalle).value) : null;

    const completa = fase !== null && motivo !== null && detalle !== null;
    const vacia = fase === null && motivo === null && detalle === null;
    if (completa || vacia) return;

    const iso = fechaIso(row.getCell(cFecha).value);
    const montoCrudo = row.getCell(cMonto).value;
    const monto = typeof montoCrudo === "number" ? montoCrudo : Number(texto(montoCrudo));
    if (iso === null || !Number.isFinite(monto)) return;

    const hash = hashDedupe(
      cProv ? texto(row.getCell(cProv).value) : null,
      cFact ? texto(row.getCell(cFact).value) : null,
      cTexto ? texto(row.getCell(cTexto).value) : null,
      iso,
      monto,
    );
    parciales.set(hash, { fase, motivo, detalle });
  });

  console.log(`Filas con taxonomía parcial en el Excel: ${parciales.size}`);

  const cliente = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: candidatos, error } = await cliente
    .from("gastos")
    .select("id, hash_dedupe")
    .is("fase", null)
    .is("motivo", null)
    .is("detalle", null);

  if (error) throw new Error(`Leyendo gastos: ${error.message}`);

  const aActualizar = (candidatos ?? [])
    .map((g) => ({ id: g.id as string, valores: parciales.get(g.hash_dedupe as string) }))
    .filter((x): x is { id: string; valores: NonNullable<typeof x.valores> } => !!x.valores);

  console.log(`Gastos que matchean por hash: ${aActualizar.length}`);

  if (dryRun) {
    console.log("--- DRY RUN: no se escribió nada ---");
    for (const x of aActualizar.slice(0, 5)) console.log("  ", x.valores);
    return;
  }

  let actualizados = 0;
  for (const x of aActualizar) {
    const { error: e } = await cliente
      .from("gastos")
      .update({
        fase: x.valores.fase,
        motivo: x.valores.motivo,
        detalle: x.valores.detalle,
      })
      .eq("id", x.id);
    if (e) console.warn(`  fallo ${x.id}: ${e.message}`);
    else actualizados += 1;
  }

  console.log(`Actualizados: ${actualizados}`);
}

main().catch((e: unknown) => {
  console.error("✗", e instanceof Error ? e.message : e);
  process.exit(1);
});
