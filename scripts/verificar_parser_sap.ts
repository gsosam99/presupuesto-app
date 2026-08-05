/**
 * Verificación del Flujo A contra archivos reales, SIN ESCRIBIR NADA.
 *
 * Contrasta la suma parseada contra el "Resultado total" que declara el propio
 * archivo y, con --clasificar, corre además los pasos 3/4/5 (cruce de maestras,
 * inferencia de #TAG y predicción de taxonomía) leyendo la base en modo lectura.
 *
 * Uso:
 *   npm run verificar:sap -- <archivo.xls> [...]
 *   npm run verificar:sap -- <archivo.xls> --clasificar
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { cargarMaestras, clasificarFilas, type Maestras } from "../src/lib/ingesta/sap";
import { parsearArchivoSap } from "../src/lib/sap/parser";
import type { Database } from "../src/types/supabase";

const conClasificacion = process.argv.includes("--clasificar");
const rutas = process.argv.slice(2).filter((a) => !a.startsWith("--"));

async function traerMaestras(): Promise<Maestras> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("--clasificar necesita NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY");
  }
  const cliente = createClient<Database>(url, key, { auth: { persistSession: false } });
  return cargarMaestras(cliente);
}

async function main(): Promise<void> {
  if (rutas.length === 0) {
    console.error("Uso: verificar_parser_sap.ts <archivo.xls> [...] [--clasificar]");
    process.exit(1);
  }

  let huboFallo = false;
  const maestras = conClasificacion ? await traerMaestras() : null;

  if (maestras) {
    console.log(
      `Maestras: ${maestras.oiPorCodigo.size} OIs | ${maestras.tags.length} tags | ` +
        `${maestras.facturasPorNumero.size} facturas pre-registradas\n`,
    );
  }

  for (const ruta of rutas) {
    console.log("=".repeat(72));
    console.log(basename(ruta));

    try {
      const r = parsearArchivoSap(readFileSync(ruta), basename(ruta));
      const suma = r.filas.reduce((s, f) => s + (f.montoReal ?? 0), 0);

      console.log(`  layout:            ${r.layout}`);
      console.log(`  filas de datos:    ${r.filasLeidas}`);
      console.log(`  gastos válidos:    ${r.filas.length}`);
      console.log(`  descartadas:       ${r.rechazos.length}`);
      console.log(`  filas de subtotal: ${r.filasSubtotal}`);
      console.log(`  suma Real parseada:  ${suma.toFixed(2)}`);
      console.log(`  total declarado SAP: ${r.totalDeclarado?.toFixed(2) ?? "—"}`);

      if (r.totalDeclarado !== null) {
        const delta = Math.abs(suma - r.totalDeclarado);
        // SAP totaliza sin redondear y muestra cada línea redondeada a 2
        // decimales: la deriva máxima es 0,005 por línea.
        const tolerancia = Math.max(0.02, 0.005 * r.filas.length);
        if (delta <= tolerancia) {
          console.log(
            `  ✓ CUADRA (delta ${delta.toFixed(2)} por redondeo de SAP; tolerancia ${tolerancia.toFixed(2)})`,
          );
        } else {
          console.log(`  ✗ DESCUADRE de ${delta.toFixed(2)} — excede la tolerancia`);
          huboFallo = true;
        }
      }

      const motivos = new Map<string, number>();
      for (const x of r.rechazos) motivos.set(x.motivo, (motivos.get(x.motivo) ?? 0) + 1);
      for (const [motivo, n] of motivos) console.log(`  descartadas: ${n} — ${motivo}`);

      const conOi = r.filas.filter((f) => f.oiCodigo !== null).length;
      console.log(`  con OI: ${conOi} | huérfanas: ${r.filas.length - conOi}`);

      if (maestras) {
        const c = clasificarFilas(r.filas, r.layout, maestras, null);
        const porEstado = new Map<string, number>();
        const porOrigen = new Map<string, number>();

        for (const reg of c.registros) {
          const e = String(reg.estado_revision);
          const o = String(reg.origen_hz);
          porEstado.set(e, (porEstado.get(e) ?? 0) + 1);
          porOrigen.set(o, (porOrigen.get(o) ?? 0) + 1);
        }

        console.log("  --- clasificación simulada (no se escribió nada) ---");
        for (const [e, n] of [...porEstado].sort()) console.log(`    estado ${e}: ${n}`);
        for (const [o, n] of [...porOrigen].sort()) console.log(`    origen HZ ${o}: ${n}`);
        console.log(
          `    cruce por factura pre-registrada: ${c.conMatchFactura}/${c.registros.length}`,
        );
        console.log(`    facturas ambiguas (asociación manual): ${c.facturasAmbiguas}`);
        console.log(`    #TAG inferido: ${c.conTagInferido}`);
        if (c.oisDesconocidas.length > 0) {
          console.log(
            `    ⚠ OIs fuera de la maestra (${c.oisDesconocidas.length}): ` +
              c.oisDesconocidas.slice(0, 8).join(", "),
          );
        }
      }
    } catch (e) {
      huboFallo = true;
      console.error("  ✗", e instanceof Error ? e.message : e);
    }
  }

  process.exit(huboFallo ? 1 : 0);
}

main().catch((e: unknown) => {
  console.error("✗", e instanceof Error ? e.message : e);
  process.exit(1);
});
