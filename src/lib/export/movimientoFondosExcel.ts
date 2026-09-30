/**
 * Excel para finanzas de una reclasificación o un ahorro.
 *
 * No hay un formato estándar de finanzas para estos movimientos (el de Extra
 * Plan sí existe y vive en extraPlanExcel.ts): se arma una tabla simple con
 * origen, destino, mes y monto, más la justificación.
 */

import ExcelJS from "exceljs";

import { trimestreDeMes } from "@/lib/fiscal";

export interface LineaMovimiento {
  mes: number;
  monto: number;
  detalle_gasto: string | null;
}

export interface DatosMovimiento {
  tipo: "reclasificacion" | "ahorro";
  origen: string;
  /** Solo reclasificación. */
  destino: string | null;
  fy: number;
  titulo: string;
  justificacion: string | null;
  lineas: LineaMovimiento[];
}

/** Primer día del mes dentro del año fiscal (el ciclo arranca en octubre). */
function fechaDelMes(fy: number, mes: number): Date {
  const anio = mes >= 10 ? fy : fy + 1;
  return new Date(Date.UTC(anio, mes - 1, 1));
}

export async function generarExcelMovimiento(datos: DatosMovimiento): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "IENN Gastos App";
  wb.created = new Date();

  const reclasificacion = datos.tipo === "reclasificacion";
  const hoja = wb.addWorksheet(reclasificacion ? "Reclasificación" : "Ahorro");

  const columnas = reclasificacion
    ? ["Q", "Mes", "Orden origen", "Orden destino", "Monto", "Detalle"]
    : ["Q", "Mes", "Orden", "Monto a devolver", "Detalle"];
  hoja.addRow(columnas);

  const encabezado = hoja.getRow(1);
  encabezado.font = { bold: true, color: { argb: "FFFFFFFF" } };
  encabezado.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0C3A57" } };
  encabezado.height = 22;

  const anioFin = String((datos.fy + 1) % 100).padStart(2, "0");
  for (const l of datos.lineas) {
    const q = `Q${trimestreDeMes(l.mes)} (${datos.fy % 100}-${anioFin})`;
    hoja.addRow(
      reclasificacion
        ? [
            q,
            fechaDelMes(datos.fy, l.mes),
            datos.origen,
            datos.destino ?? "",
            l.monto,
            l.detalle_gasto ?? "",
          ]
        : [q, fechaDelMes(datos.fy, l.mes), datos.origen, l.monto, l.detalle_gasto ?? ""],
    );
  }

  const colMonto = reclasificacion ? 5 : 4;
  hoja.getColumn(2).numFmt = "dd/mm/yyyy";
  hoja.getColumn(colMonto).numFmt = "#,##0.00";
  hoja.columns.forEach((col, i) => {
    col.width = (reclasificacion ? [12, 12, 16, 16, 14, 40] : [12, 12, 16, 16, 40])[i] ?? 16;
  });

  const contexto = wb.addWorksheet("Justificación");
  contexto.addRow(["Solicitud", datos.titulo]);
  contexto.addRow(["Tipo", reclasificacion ? "Reclasificación" : "Ahorro"]);
  contexto.addRow([reclasificacion ? "Orden origen" : "Orden", datos.origen]);
  if (reclasificacion) contexto.addRow(["Orden destino", datos.destino ?? ""]);
  contexto.addRow(["Año fiscal", `${datos.fy % 100}/${anioFin}`]);
  const filaTotal = contexto.addRow(["Total", datos.lineas.reduce((s, l) => s + l.monto, 0)]);
  filaTotal.getCell(2).numFmt = "#,##0.00";
  contexto.addRow([]);
  contexto.addRow(["Justificación", datos.justificacion ?? ""]);
  contexto.getColumn(1).width = 20;
  contexto.getColumn(2).width = 80;
  contexto.getColumn(2).alignment = { wrapText: true, vertical: "top" };

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function nombreArchivoMovimiento(
  tipo: DatosMovimiento["tipo"],
  codigo: string,
  fy: number,
): string {
  const limpio = codigo.replace(/[^\w.-]+/g, "-");
  const prefijo = tipo === "reclasificacion" ? "Reclasificacion" : "Ahorro";
  return `${prefijo}_${limpio}_FY${fy % 100}-${(fy + 1) % 100}.xlsx`;
}
