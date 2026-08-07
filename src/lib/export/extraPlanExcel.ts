/**
 * Genera el Excel de Extra Plan que se envía a finanzas.
 *
 * Replica el formato estándar ("Formato - Extra Plan …") columna por columna,
 * de modo que finanzas lo reciba igual que siempre y que la propia app pueda
 * volver a ingerirlo sin cambios si hiciera falta.
 */

import ExcelJS from "exceljs";

import { mesesDeTrimestre, trimestreDeMes } from "@/lib/fiscal";

export interface LineaExtraPlan {
  mes: number;
  monto: number;
  cuenta_contable: string | null;
  descripcion_cuenta: string | null;
  tipo_gasto: string | null;
  detalle_gasto: string | null;
  responsable: string | null;
}

export interface DatosExtraPlan {
  codigoOi: string;
  cecoDeclarado: string | null;
  area: string | null;
  fy: number;
  titulo: string;
  justificacion: string | null;
  lineas: LineaExtraPlan[];
}

const COLUMNAS = [
  "Q",
  "Mes",
  "Centro de Costo",
  "Área",
  "Nueva Orden",
  "Cuenta Contable",
  "Numero de Cuenta",
  "Tipo de Gasto",
  "Detalle del Gasto",
  "$Presupuesto",
  "$ Ejecutado",
  "Descripción de cuenta",
  "Responsable",
  "Detalle para la carga",
] as const;

/** Primer día del mes dentro del año fiscal (el ciclo arranca en octubre). */
function fechaDelMes(fy: number, mes: number): Date {
  const anio = mes >= 10 ? fy : fy + 1;
  return new Date(Date.UTC(anio, mes - 1, 1));
}

export async function generarExcelExtraPlan(datos: DatosExtraPlan): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "IENN Gastos App";
  wb.created = new Date();

  const hoja = wb.addWorksheet("Extra Plan");
  hoja.addRow([...COLUMNAS]);

  const encabezado = hoja.getRow(1);
  encabezado.font = { bold: true, color: { argb: "FFFFFFFF" } };
  encabezado.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0C3A57" },
  };
  encabezado.alignment = { vertical: "middle" };
  encabezado.height = 22;

  for (const l of datos.lineas) {
    const trimestre = trimestreDeMes(l.mes);
    const meses = mesesDeTrimestre(trimestre);
    const anioFin = (datos.fy + 1) % 100;

    hoja.addRow([
      `Q${trimestre} (${datos.fy % 100}-${String(anioFin).padStart(2, "0")})`,
      fechaDelMes(datos.fy, l.mes),
      datos.cecoDeclarado ?? "",
      datos.area ?? "",
      datos.codigoOi,
      l.descripcion_cuenta ?? "",
      l.cuenta_contable ?? "",
      l.tipo_gasto ?? "",
      l.detalle_gasto ?? "",
      l.monto,
      null,
      l.descripcion_cuenta ?? "",
      l.responsable ?? "",
      [l.tipo_gasto, l.detalle_gasto].filter(Boolean).join("-"),
    ]);

    // El primer mes del trimestre se usa solo para calcular la etiqueta Q.
    void meses;
  }

  // Formatos: fecha corta y monto con dos decimales, como el archivo original.
  hoja.getColumn(2).numFmt = "dd/mm/yyyy";
  hoja.getColumn(10).numFmt = "#,##0.00";
  hoja.getColumn(11).numFmt = "#,##0.00";

  hoja.columns.forEach((col, i) => {
    col.width = [12, 12, 16, 28, 14, 30, 16, 22, 38, 14, 12, 30, 20, 38][i] ?? 16;
  });

  // Hoja de contexto: por qué se pide. No la lee el importador, la lee finanzas.
  const contexto = wb.addWorksheet("Justificación");
  contexto.addRow(["Solicitud", datos.titulo]);
  contexto.addRow(["Orden Interna", datos.codigoOi]);
  contexto.addRow(["Año fiscal", `${datos.fy % 100}/${(datos.fy + 1) % 100}`]);
  contexto.addRow([
    "Total solicitado",
    datos.lineas.reduce((s, l) => s + l.monto, 0),
  ]);
  contexto.addRow([]);
  contexto.addRow(["Justificación", datos.justificacion ?? ""]);
  contexto.getColumn(1).width = 20;
  contexto.getColumn(2).width = 80;
  contexto.getColumn(2).alignment = { wrapText: true, vertical: "top" };
  contexto.getRow(4).getCell(2).numFmt = "#,##0.00";

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function nombreArchivoExtraPlan(codigoOi: string, fy: number): string {
  const limpio = codigoOi.replace(/[^\w.-]+/g, "-");
  return `ExtraPlan_${limpio}_FY${fy % 100}-${(fy + 1) % 100}.xlsx`;
}
