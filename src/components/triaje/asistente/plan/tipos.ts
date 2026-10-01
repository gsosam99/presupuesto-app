/**
 * Piezas compartidas por los pasos 3 a 6 del asistente de carga, que trabajan
 * sobre el plan en memoria (ver src/lib/ingesta/planCarga.ts) y no sobre la
 * base. Solo tipos y funciones puras: se usan desde Client Components.
 */

import type { AjusteGasto } from "@/lib/ingesta/sap";
import type { FilaPlan, NombresPlan } from "@/lib/ingesta/planCarga";

export type { AjusteGasto, FilaPlan, NombresPlan };

/** Decisiones del asistente por clave de fila. */
export type Ajustes = Record<string, AjusteGasto>;

/** Combina decisiones nuevas con las previas de cada fila. */
export type Ajustar = (claves: string[], ajuste: AjusteGasto) => void;

/** Quita campos de la decisión de cada fila (deshacer una acción del asistente). */
export type Revertir = (claves: string[], campos: Array<keyof AjusteGasto>) => void;

/** Una factura que cruzó sola, con sus posiciones de SAP (paso 3). */
export interface GrupoAutomatico {
  idFactura: string;
  numero: string;
  numeroOrden: string | null;
  montoEstimado: number | null;
  moneda: string | null;
  codigoOi: string | null;
  huntingZone: string | null;
  encargado: string | null;
  claves: string[];
  real: number;
}

/**
 * Agrupa por factura lo que cruzó solo. Se calcula una vez, con el plan sin
 * decisiones: después de deshacer un cruce la fila ya no tiene factura y no
 * habría cómo volver a agruparla para restaurarlo.
 */
export function agruparAutomaticos(filas: FilaPlan[], nombres: NombresPlan): GrupoAutomatico[] {
  const grupos = new Map<string, GrupoAutomatico>();
  for (const f of filas) {
    if (f.metodo_cruce !== "automatico" || !f.id_factura_preregistrada) continue;
    const factura = nombres.factura[f.id_factura_preregistrada];
    const g = grupos.get(f.id_factura_preregistrada) ?? {
      idFactura: f.id_factura_preregistrada,
      numero: factura?.numero ?? f.factura ?? "—",
      numeroOrden: factura?.numeroOrden ?? null,
      montoEstimado: factura?.montoEstimado ?? null,
      moneda: factura?.moneda ?? null,
      codigoOi: f.id_oi ? (nombres.oi[f.id_oi] ?? null) : null,
      huntingZone: f.id_hunting_zone ? (nombres.hz[f.id_hunting_zone] ?? null) : null,
      encargado: f.id_encargado ? (nombres.encargado[f.id_encargado] ?? null) : null,
      claves: [],
      real: 0,
    };
    g.claves.push(f.clave);
    g.real += f.monto_real;
    grupos.set(f.id_factura_preregistrada, g);
  }
  return [...grupos.values()].sort((a, b) => a.numero.localeCompare(b.numero, "es"));
}

/** Orden Interna y Hunting Zone legibles de una fila. */
export function destinoDe(f: FilaPlan, nombres: NombresPlan): string {
  const oi = f.id_oi ? nombres.oi[f.id_oi] : null;
  const hz = f.id_hunting_zone ? nombres.hz[f.id_hunting_zone] : null;
  return [oi, hz].filter(Boolean).join(" · ") || "sin proyecto";
}
