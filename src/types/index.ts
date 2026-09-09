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
  /**
   * Sin uso: la columna sigue en la base pero la app no la lee ni la escribe.
   * El dashboard reparte su paleta por `orden_display`. No volver a exponerla
   * en Configuración sin cablearla de verdad primero.
   */
  color_hex: string | null;
  /** Ordena Configuración y el desplegable de Facturas, y fija el color en el dashboard. */
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
// Gestión de presupuesto: disponibilidad trimestral y solicitudes
// ---------------------------------------------------------------------------

/** Trimestre del año fiscal: 1 = Oct-Dic, 2 = Ene-Mar, 3 = Abr-Jun, 4 = Jul-Sep. */
export type Trimestre = 1 | 2 | 3 | 4;

export type EstadoTrimestre = "cerrado" | "actual" | "futuro";

export type TipoSolicitud = "extra_plan" | "prorroga";

export type EstadoSolicitud = "borrador" | "enviada" | "aprobada" | "rechazada";

/** Fila de disponibilidad_trimestral(): el bolsillo de una OI en un trimestre. */
export interface DisponibilidadTrimestre {
  clave: string;
  id_oi: string | null;
  codigo_oi: string | null;
  id_ceco: string | null;
  codigo_ceco: string | null;
  id_hunting_zone: string | null;
  hunting_zone: string | null;
  trimestre: Trimestre;
  estado_trimestre: EstadoTrimestre;
  monto_plan: number;
  monto_extra: number;
  /** Sobrante del trimestre anterior salvado por una prórroga aprobada. */
  arrastre_recibido: number;
  /** plan + extra + arrastre recibido. */
  disponible: number;
  consumido: number;
  saldo: number;
  arrastre_siguiente: number;
  /** Sobrante de un trimestre cerrado que ninguna prórroga salvó: se perdió. */
  vencido: number;
}

export interface Solicitud {
  id: string;
  tipo: TipoSolicitud;
  estado: EstadoSolicitud;
  id_oi: string | null;
  id_ceco: string | null;
  fy: number;
  trimestre: Trimestre | null;
  titulo: string;
  justificacion: string | null;
  monto_solicitado: number | null;
  referencia_aprobacion: string | null;
  nota_resolucion: string | null;
  creada_por: string | null;
  resuelta_por: string | null;
  enviada_at: string | null;
  resuelta_at: string | null;
  created_at: string;
}

export interface SolicitudLinea {
  id: string;
  id_solicitud: string;
  mes: number;
  monto: number;
  cuenta_contable: string | null;
  descripcion_cuenta: string | null;
  tipo_gasto: string | null;
  detalle_gasto: string | null;
  responsable: string | null;
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

// ---------------------------------------------------------------------------
// Ingresos
// ---------------------------------------------------------------------------

/**
 * Ingreso recibido por un proyecto. Espejo de public.ingresos.
 *
 * A diferencia de un gasto no cuelga de un CeCo ni de una Orden Interna: se
 * imputa a una Hunting Zone y a un período (fy + mes). Se carga a mano, así que
 * no tiene estado de revisión ni trazabilidad de carga.
 */
export interface Ingreso {
  id: string;
  fy: number;
  mes: number;
  id_hunting_zone: string;
  /** Qué se cobró. Obligatorio: es el descriptor principal del ingreso. */
  concepto: string;
  fase: string | null;
  motivo: string | null;
  detalle: string | null;
  monto: number;
  nota: string | null;
  creado_por: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface RegistroDashboard {
  af: string;
  fase: string;
  hz: string;
  motivo: string;
  detalle: string;
  monto: number;
  n: number;
}

/** Fila de la vista v_dashboard_ingresos: igual que un gasto más `concepto`. */
export interface RegistroIngresoDashboard extends RegistroDashboard {
  concepto: string;
}

export interface DatosDashboard {
  anios: string[];
  currentFY: string;
  fases: string[];
  /** Hunting Zones ordenadas por monto (gasto + ingreso) de mayor a menor. */
  hzs: string[];
  /**
   * Orden de la maestra (`orden_display`). Es el índice ESTABLE con el que se
   * reparte la paleta: si se usara la posición en `hzs`, que va por monto, los
   * colores bailarían cada mes al cambiar el ranking.
   */
  hzOrdenPaleta: string[];
  monthlyCurrent: Record<string, number>;
  monthlyIncomeCurrent: Record<string, number>;
  asof: string;
  records: RegistroDashboard[];
  ingresos: RegistroIngresoDashboard[];
}
