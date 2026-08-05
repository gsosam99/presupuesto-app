/**
 * Tipos de dominio de la IENN Gastos App.
 * Espejo de supabase/schema.sql. Tipos puros: no importan React ni Supabase.
 */

// ---------------------------------------------------------------------------
// Enumerados (deben coincidir con los ENUM de Postgres)
// ---------------------------------------------------------------------------

/**
 * pendiente — en la Sala de Triaje.
 * aprobado  — cuenta en los KPIs.
 * excluido  — papelera/archivado: SAP lo trae pero no entra en el control.
 *             Reversible: vuelve a 'pendiente' desde la app.
 */
export type EstadoRevision = "pendiente" | "aprobado" | "excluido";

export type FuenteGasto = "sap_ceco" | "sap_oi" | "manual";

export type OrigenAsignacion =
  | "orden_interna"
  | "prerregistro"
  | "tag_texto"
  | "manual"
  | "sin_asignar";

export type TipoPresupuesto = "plan" | "extra_plan";

export type TipoCarga =
  | "sap_ceco"
  | "sap_oi"
  | "presupuesto_plan"
  | "presupuesto_extra_plan"
  | "preregistro_facturas"
  | "maestras";

export type EstadoCarga = "procesando" | "completada" | "fallida";

// ---------------------------------------------------------------------------
// Maestras
// ---------------------------------------------------------------------------

export interface Ceco {
  id: string;
  codigo_sap: string;
  nombre: string;
  usa_proyectos: boolean;
  activo: boolean;
}

export interface HuntingZone {
  id: string;
  nombre: string;
  tag_principal: string | null;
  color_hex: string | null;
  orden_display: number;
  activo: boolean;
  /** Si es true, la ingesta manda sus gastos directo a la papelera. */
  archivar_automatico: boolean;
}

export interface HuntingZoneTag {
  id: string;
  id_hunting_zone: string;
  tag: string;
  prioridad: number;
  activo: boolean;
}

export interface OrdenInterna {
  id: string;
  codigo_oi: string;
  nombre: string | null;
  id_ceco: string | null;
  id_hunting_zone: string | null;
  /** Año de inicio del ciclo fiscal. 2025 == "25/26". */
  fy: number | null;
  activo: boolean;
}

// ---------------------------------------------------------------------------
// Transaccional
// ---------------------------------------------------------------------------

export interface Gasto {
  id: string;

  // Data SAP inmutable
  fuente: FuenteGasto;
  factura: string | null;
  fecha_documento: string; // ISO date (YYYY-MM-DD)
  proveedor_codigo: string | null;
  proveedor: string | null;
  texto_referencia: string | null;
  grupo_clase_coste: string | null;
  ceco_codigo_raw: string | null;
  oi_codigo_raw: string | null;
  monto_real: number;
  monto_plan_sap: number | null;
  monto_comprometido: number | null;

  // Data mutable (app)
  id_ceco: string | null;
  id_oi: string | null;
  id_hunting_zone: string | null;
  /** Taxonomía: tres campos independientes de texto libre con autocompletado. */
  fase: string | null;
  motivo: string | null;
  detalle: string | null;
  /** Factura pre-registrada que originó la clasificación, si hubo cruce. */
  id_factura_preregistrada: string | null;
  origen_hz: OrigenAsignacion;
  estado_revision: EstadoRevision;
  nota: string | null;

  // Derivados
  fy: number;
  mes: number;
  hash_dedupe: string;
  id_carga: string | null;
}

/** Fila de la vista v_gastos_enriquecidos — lo que consumen dashboard y triaje. */
export interface GastoEnriquecido {
  id: string;
  fecha_documento: string;
  fy: number;
  fy_etiqueta: string;
  mes: number;
  factura: string | null;
  proveedor: string | null;
  texto_referencia: string | null;
  grupo_clase_coste: string | null;
  monto_real: number;
  estado_revision: EstadoRevision;
  origen_hz: OrigenAsignacion;
  ceco_codigo: string | null;
  ceco_nombre: string | null;
  codigo_oi: string | null;
  oi_nombre: string | null;
  hunting_zone: string | null;
  tag_principal: string | null;
  fase: string | null;
  motivo: string | null;
  detalle: string | null;
}

export interface Presupuesto {
  id: string;
  id_oi: string;
  tipo: TipoPresupuesto;
  fy: number;
  mes: number;
  quarter: string | null;
  monto: number;
  cuenta_contable: string | null;
  descripcion_cuenta: string | null;
  tipo_gasto: string | null;
  detalle_gasto: string | null;
  responsable: string | null;
  area: string | null;
  ceco_declarado: string | null;
  id_carga: string | null;
}

/** Fila de v_presupuesto_oi_mes — la forma agregada que describe el PRD §3.5. */
export interface PresupuestoOiMes {
  id_oi: string;
  codigo_oi: string;
  id_ceco: string | null;
  id_hunting_zone: string | null;
  fy: number;
  fy_etiqueta: string;
  mes: number;
  monto_plan: number | null;
  monto_suplemento_extra_plan: number | null;
  monto_total: number;
}

/** Fila de v_ejecucion_mensual_hz — insumo del Rolling Forecast (Flujo D). */
export interface EjecucionMensualHz {
  id_hunting_zone: string | null;
  fy: number;
  mes: number;
  monto_real_aprobado: number;
  monto_real_pendiente: number;
  /** Aprobado + pendiente. Los archivados nunca entran. */
  monto_real: number;
  monto_plan: number;
  monto_extra_plan: number;
  presupuesto_total: number;
  desviacion: number;
}

// ---------------------------------------------------------------------------
// Pre-registro de facturas
// ---------------------------------------------------------------------------

/**
 * Factura que finanzas registra ANTES de que llegue el reporte de SAP.
 * El cruce por número trae la taxonomía y el proyecto ya definidos.
 */
export interface FacturaPreregistrada {
  id: string;
  numero_factura: string;
  /** Generada en la base: sin espacios, en mayúsculas y sin ceros a la izquierda. */
  numero_normalizado: string | null;
  proveedor: string | null;
  texto_referencia: string | null;
  fecha_factura: string | null;
  id_oi: string | null;
  id_hunting_zone: string | null;
  fase: string | null;
  motivo: string | null;
  detalle: string | null;
  /** Informativo. Nunca participa del cruce: puede estar en Bs. */
  monto_estimado: number | null;
  moneda: "USD" | "VES";
  nota: string | null;
  activo: boolean;
}

/** Fila de v_conciliacion_facturas: una factura puede tener varias posiciones en SAP. */
export interface ConciliacionFactura {
  id_factura_preregistrada: string;
  numero_factura: string;
  numero_normalizado: string | null;
  proveedor: string | null;
  fecha_factura: string | null;
  monto_estimado: number | null;
  moneda: "USD" | "VES";
  posiciones_sap: number;
  monto_real_sap: number;
  /** Solo se calcula si el estimado estaba en USD. */
  desvio_usd: number | null;
  conciliada: boolean;
}

// ---------------------------------------------------------------------------
// Cargas (Flujos A y B)
// ---------------------------------------------------------------------------

export interface Carga {
  id: string;
  tipo: TipoCarga;
  nombre_archivo: string;
  hash_archivo: string | null;
  estado: EstadoCarga;
  filas_leidas: number;
  filas_insertadas: number;
  filas_duplicadas: number;
  filas_rechazadas: number;
  mensaje: string | null;
  created_at: string;
  finalizada_at: string | null;
}

export interface CargaRechazo {
  id: string;
  id_carga: string;
  fila: number | null;
  motivo: string;
  payload: Record<string, unknown> | null;
}

/** Resultado que devuelve un parser de archivo antes de persistir. */
export interface ResultadoParseo<T> {
  filas: T[];
  rechazos: Array<{ fila: number; motivo: string; payload: Record<string, unknown> }>;
  filasLeidas: number;
}
