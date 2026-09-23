/** Utilidades de meses "YYYY-MM" para los pasos 1 y 2 del asistente. */

const NOMBRE_MES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export function etiquetaMes(mes: string): string {
  const [a, m] = mes.split("-");
  return `${NOMBRE_MES[Number(m) - 1]} ${a}`;
}

/** Último día del mes "YYYY-MM", como ISO. */
export function finDeMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${mes}-${String(new Date(a, m, 0).getDate()).padStart(2, "0")}`;
}

export type Inclusion = "dentro" | "parcial" | "fuera";

export function inclusionDelMes(mes: string, desde: string, hasta: string): Inclusion {
  const inicio = `${mes}-01`;
  const fin = finDeMes(mes);
  if (fin < desde || inicio > hasta) return "fuera";
  return inicio >= desde && fin <= hasta ? "dentro" : "parcial";
}
