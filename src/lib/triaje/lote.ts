/**
 * Lectura de un lote de carga (los archivos subidos juntos en el asistente de
 * cruce): sus cargas y todos los gastos que produjeron, en cualquier estado.
 * El estado de cada paso del asistente se deriva de acá.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ResumenIngesta } from "@/lib/ingesta/sap";
import type { EstadoRevision, MetodoCruce, OrigenAsignacion } from "@/types";
import type { Database } from "@/types/supabase";

export interface CargaLote {
  id: string;
  nombre_archivo: string;
  tipo: string;
  estado: string;
  created_at: string;
  resumen: ResumenIngesta | null;
}

/** Fila de v_gastos_cruce. */
export interface GastoLote {
  id: string;
  id_carga: string;
  fecha_documento: string;
  factura: string | null;
  proveedor: string | null;
  proveedor_codigo: string | null;
  texto_referencia: string | null;
  grupo_clase_coste: string | null;
  ceco_codigo: string | null;
  ceco_codigo_raw: string | null;
  oi_codigo_raw: string | null;
  nota: string | null;
  monto_real: number;
  estado_revision: EstadoRevision;
  origen_hz: OrigenAsignacion;
  metodo_cruce: MetodoCruce | null;
  id_factura_preregistrada: string | null;
  factura_preregistrada: string | null;
  numero_orden: string | null;
  monto_estimado: number | null;
  moneda: string | null;
  id_encargado: string | null;
  encargado: string | null;
  id_oi: string | null;
  codigo_oi: string | null;
  id_hunting_zone: string | null;
  hunting_zone: string | null;
  fase: string | null;
  motivo: string | null;
  detalle: string | null;
  revisado_at: string | null;
}

const COLUMNAS =
  "id, id_carga, fecha_documento, factura, proveedor, proveedor_codigo, texto_referencia, " +
  "grupo_clase_coste, ceco_codigo, ceco_codigo_raw, oi_codigo_raw, nota, monto_real, " +
  "estado_revision, origen_hz, metodo_cruce, id_factura_preregistrada, factura_preregistrada, " +
  "numero_orden, monto_estimado, moneda, id_encargado, encargado, id_oi, codigo_oi, " +
  "id_hunting_zone, hunting_zone, fase, motivo, detalle, revisado_at";

const PASO = 1000;

export async function obtenerLote(
  supabase: SupabaseClient<Database>,
  idLote: string,
): Promise<{ cargas: CargaLote[]; gastos: GastoLote[]; error: string | null }> {
  const { data: cargas, error: errorCargas } = await supabase
    .from("cargas")
    .select("id, nombre_archivo, tipo, estado, created_at, resumen")
    .eq("id_lote", idLote)
    .order("created_at");

  if (errorCargas) return { cargas: [], gastos: [], error: errorCargas.message };

  const gastos: GastoLote[] = [];
  for (let i = 0; ; i += PASO) {
    const { data, error } = await supabase
      .from("v_gastos_cruce")
      .select(COLUMNAS)
      .eq("id_lote", idLote)
      .order("fecha_documento", { ascending: false })
      .order("id")
      .range(i, i + PASO - 1);

    if (error) return { cargas: [], gastos, error: error.message };
    const filas = (data ?? []) as unknown as GastoLote[];
    gastos.push(
      ...filas.map((g) => ({
        ...g,
        monto_real: Number(g.monto_real),
        monto_estimado: g.monto_estimado === null ? null : Number(g.monto_estimado),
      })),
    );
    if (filas.length < PASO) break;
  }

  return {
    cargas: (cargas ?? []).map((c) => ({
      id: c.id,
      nombre_archivo: c.nombre_archivo,
      tipo: c.tipo,
      estado: c.estado,
      created_at: c.created_at,
      resumen: (c.resumen as unknown as ResumenIngesta | null) ?? null,
    })),
    gastos,
    error: null,
  };
}

/** Facturas pre-registradas activas que todavía no cruzaron con ningún gasto. */
export interface FacturaSinCruzar {
  id: string;
  numero_factura: string;
  numero_orden: string | null;
  proveedor_codigo: string | null;
  fecha_factura: string | null;
  monto_estimado: number | null;
  moneda: string;
  codigo_oi: string | null;
  hunting_zone: string | null;
  encargado: string | null;
}

export async function obtenerFacturasSinCruzar(
  supabase: SupabaseClient<Database>,
): Promise<{ data: FacturaSinCruzar[]; error: string | null }> {
  const salida: FacturaSinCruzar[] = [];
  for (let i = 0; ; i += PASO) {
    const { data, error } = await supabase
      .from("v_conciliacion_facturas")
      .select(
        "id_factura_preregistrada, numero_factura, numero_orden, proveedor_codigo, fecha_factura, monto_estimado, moneda, codigo_oi, hunting_zone, encargado",
      )
      .eq("conciliada", false)
      .order("fecha_factura", { ascending: false, nullsFirst: false })
      .range(i, i + PASO - 1);

    if (error) return { data: salida, error: error.message };
    const filas = (data ?? []) as unknown as Array<
      Omit<FacturaSinCruzar, "id"> & { id_factura_preregistrada: string }
    >;
    salida.push(
      ...filas.map(({ id_factura_preregistrada, ...f }) => ({
        ...f,
        id: id_factura_preregistrada,
        monto_estimado: f.monto_estimado === null ? null : Number(f.monto_estimado),
      })),
    );
    if (filas.length < PASO) break;
  }
  return { data: salida, error: null };
}
