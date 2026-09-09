/**
 * Flujo E — exportación del dashboard a un HTML interactivo y offline.
 *
 * En vez de reimplementar el reporte, se reutiliza como plantilla el mismo
 * archivo que el equipo aprobó: se le inyectan los datos vigentes y se embebe
 * Chart.js. El resultado conserva pestañas, filtros, hovers y tooltips, y abre
 * sin conexión ni servidor.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface DatosExport {
  anios: string[];
  currentFY: string;
  fyStartMonth: number;
  fases: string[];
  hzs: string[];
  monthlyCurrent: Record<string, number>;
  asof: string;
  /** [af, fase, hz, motivo, detalle, monto, n] — formato compacto del original. */
  records: Array<[string, string, string, string, string, number, number]>;
  /**
   * Igual que `records` más `concepto` al final.
   *
   * OJO: la plantilla HTML todavía NO dibuja ingresos — sólo lee RAW.records,
   * RAW.hzs y RAW.monthlyCurrent, e ignora las claves que no conoce. Van acá
   * para que el archivo descargado ya lleve el dato encima, pero hasta que la
   * plantilla se actualice el export muestra sólo gastos.
   */
  ingresos: Array<[string, string, string, string, string, number, number, string]>;
  monthlyIncomeCurrent: Record<string, number>;
}

/**
 * Rutas candidatas: en desarrollo el archivo vive en src/, y en el bundle de
 * producción Next lo copia junto al output del servidor.
 */
async function leerRecurso(rutas: string[]): Promise<string> {
  const errores: string[] = [];
  for (const ruta of rutas) {
    try {
      return await readFile(ruta, "utf8");
    } catch (e) {
      errores.push(`${ruta}: ${e instanceof Error ? e.message : "error"}`);
    }
  }
  throw new Error(`No se pudo leer el recurso. Intentos: ${errores.join(" | ")}`);
}

export async function generarHtmlDashboard(datos: DatosExport): Promise<string> {
  const raiz = process.cwd();

  const [plantilla, chartjs] = await Promise.all([
    leerRecurso([
      join(raiz, "src/lib/export/plantilla-dashboard.html"),
      join(raiz, "plantilla-dashboard.html"),
    ]),
    leerRecurso([
      join(raiz, "node_modules/chart.js/dist/chart.umd.js"),
      join(raiz, "node_modules/chart.js/dist/chart.umd.min.js"),
    ]),
  ]);

  // JSON.stringify escapa las comillas; se neutraliza además "</script>" para
  // que un texto de referencia no pueda cerrar el bloque e inyectar markup.
  const json = JSON.stringify(datos).replace(/<\/script/gi, "<\\/script");

  return plantilla
    .replace("/*__CHARTJS__*/", () => chartjs)
    .replace("/*__DATOS__*/", () => json);
}

/** Nombre de archivo con la fecha de corte, para no pisar exportes previos. */
export function nombreArchivoExport(asof: string): string {
  const limpio = asof.replace(/[^\w]+/g, "-").toLowerCase();
  return `Dashboard_Presupuestario_IENN_${limpio || "actual"}.html`;
}
