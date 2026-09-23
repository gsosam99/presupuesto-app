/**
 * Lectura de facturas pre-registradas para la tabla de /facturas.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { finFy, inicioFy } from "@/lib/fiscal";
import type { ConciliacionFactura } from "@/types";
import type { Database } from "@/types/supabase";

const COLUMNAS =
  "id_factura_preregistrada, numero_factura, numero_normalizado, numero_orden, proveedor, " +
  "proveedor_codigo, fecha_factura, monto_estimado, moneda, posiciones_sap, monto_real_sap, " +
  "desvio_usd, conciliada, id_encargado, encargado, texto_referencia, id_oi, codigo_oi, " +
  "hunting_zone, fase, motivo, detalle, nota, id_ceco, created_at";

const PASO = 1000;

function isoDia(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/**
 * Facturas del año fiscal: las fechadas dentro del FY y las que todavía no
 * tienen fecha (no se pierden de vista). Pagina de a 1000 porque PostgREST
 * corta ahí.
 */
export async function obtenerFacturasDelFy(
  supabase: SupabaseClient<Database>,
  fy: number,
): Promise<{ data: ConciliacionFactura[]; error: string | null }> {
  const desde = isoDia(inicioFy(fy));
  const hasta = isoDia(finFy(fy));
  const salida: ConciliacionFactura[] = [];

  for (let i = 0; ; i += PASO) {
    const { data, error } = await supabase
      .from("v_conciliacion_facturas")
      .select(COLUMNAS)
      .or(`and(fecha_factura.gte.${desde},fecha_factura.lte.${hasta}),fecha_factura.is.null`)
      .order("fecha_factura", { ascending: false, nullsFirst: true })
      .order("created_at", { ascending: false })
      .range(i, i + PASO - 1);

    if (error) return { data: salida, error: error.message };
    const filas = (data ?? []) as unknown as ConciliacionFactura[];
    salida.push(
      ...filas.map((f) => ({
        ...f,
        monto_estimado: f.monto_estimado === null ? null : Number(f.monto_estimado),
        monto_real_sap: Number(f.monto_real_sap),
        desvio_usd: f.desvio_usd === null ? null : Number(f.desvio_usd),
        posiciones_sap: Number(f.posiciones_sap),
      })),
    );
    if (filas.length < PASO) break;
  }

  return { data: salida, error: null };
}
