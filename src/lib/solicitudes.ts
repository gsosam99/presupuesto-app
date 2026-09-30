/** Etiquetas y reglas de presentación de las solicitudes. */

import type { TipoSolicitud } from "@/types";

export const ETIQUETA_TIPO_SOLICITUD: Record<TipoSolicitud, string> = {
  extra_plan: "Extra plan",
  reclasificacion: "Reclasificación",
  provision: "Provisión",
  ahorro: "Ahorro",
};

/** Etiqueta de un tipo leído de la base (incluye valores viejos, como "prorroga"). */
export function etiquetaTipoSolicitud(tipo: string): string {
  return tipo in ETIQUETA_TIPO_SOLICITUD
    ? ETIQUETA_TIPO_SOLICITUD[tipo as TipoSolicitud]
    : tipo === "prorroga"
      ? "Provisión"
      : tipo;
}

/** Tipos que se piden por líneas de mes + monto. */
export const TIPOS_CON_LINEAS: ReadonlySet<TipoSolicitud> = new Set([
  "extra_plan",
  "reclasificacion",
  "ahorro",
]);
