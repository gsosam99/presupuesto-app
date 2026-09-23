/**
 * Reglas compartidas por el alta y la edición de facturas pre-registradas.
 */

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolverOiPorId } from "@/lib/presupuesto/resolverOi";
import type { Database } from "@/types/supabase";

/** Campos de la factura que el usuario escribe. */
export const camposFacturaSchema = z.object({
  numero_factura: z.string().trim().min(1, "El número de factura es obligatorio"),
  /** Número de Orden impreso en la factura. NO es la Orden Interna (id_oi). */
  numero_orden: z.string().nullable().optional(),
  id_encargado: z.string().uuid().nullable().optional(),
  proveedor_codigo: z.string().nullable().optional(),
  texto_referencia: z.string().nullable().optional(),
  fecha_factura: z.string().nullable().optional(),
  id_oi: z.string().nullable().optional(),
  id_ceco: z.string().nullable().optional(),
  id_hunting_zone: z.string().nullable().optional(),
  fase: z.string().nullable().optional(),
  motivo: z.string().nullable().optional(),
  detalle: z.string().nullable().optional(),
  monto_estimado: z.number().nullable().optional(),
  moneda: z.enum(["USD", "VES"]).optional(),
  nota: z.string().nullable().optional(),
});

export type CamposFactura = z.infer<typeof camposFacturaSchema>;

/**
 * La Hunting Zone la define siempre la Orden Interna (real o etiqueta), y el
 * CeCo se hereda del padre cuando la orden es real. El cliente nunca decide
 * a qué proyecto va una factura.
 */
export async function resolverDestino(
  supabase: SupabaseClient<Database>,
  idOi: string | null,
  idCeco: string | null,
): Promise<{ idHz: string | null; idCeco: string | null } | { error: string }> {
  if (!idOi) return { idHz: null, idCeco };

  const { data: oi, error } = await resolverOiPorId(supabase, idOi);
  if (error) {
    console.error("[resolverDestino]", error);
    return { error: "No se pudo resolver la Orden Interna." };
  }
  if (!oi) return { error: "La Orden Interna no existe." };

  return {
    idHz: oi.id_hunting_zone,
    idCeco: oi.tipo === "real" && oi.id_ceco ? oi.id_ceco : idCeco,
  };
}
