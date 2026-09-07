/**
 * Tipos generados de la base de datos. NO EDITAR A MANO... salvo excepción.
 *
 * Regenerar cuando cambie supabase/schema.sql:
 *   npx supabase gen types typescript --project-id <PROJECT_ID> --schema public > src/types/supabase.ts
 *
 * Hasta que exista un proyecto Supabase vivo contra el cual generar, este
 * archivo declara a mano las 8 tablas que hoy tocan los Route Handlers y
 * Server Components (cecos, ordenes_internas, hunting_zones,
 * facturas_preregistradas, presupuestos, solicitudes, gastos, cargas) —
 * copiadas de los `create table`/`alter table` de supabase/schema.sql — y
 * deja el resto de las tablas y todas las vistas bajo el stub genérico
 * `Record<string, Json>` de siempre. Los tipos de dominio (los que usa la UI)
 * viven en src/types/index.ts.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// ---------------------------------------------------------------------------
// Enums (public.*, ver supabase/schema.sql)
// ---------------------------------------------------------------------------

type TipoPresupuestoDB = "plan" | "extra_plan";
type TipoSolicitudDB = "extra_plan" | "prorroga";
type EstadoSolicitudDB = "borrador" | "enviada" | "aprobada" | "rechazada";
type TipoOrdenInternaDB = "real" | "tag";
type FuenteGastoDB = "sap_ceco" | "sap_oi" | "manual";
type OrigenAsignacionDB =
  | "orden_interna"
  | "prerregistro"
  | "tag_texto"
  | "manual"
  | "sin_asignar";
type EstadoRevisionDB = "pendiente" | "aprobado" | "excluido";
type TipoCargaDB =
  | "sap_ceco"
  | "sap_oi"
  | "presupuesto_plan"
  | "presupuesto_extra_plan"
  | "preregistro_facturas"
  | "maestras";
type EstadoCargaDB = "procesando" | "completada" | "fallida";

// ---------------------------------------------------------------------------
// Tablas tipadas a mano
// ---------------------------------------------------------------------------

interface CecosRow {
  id: string;
  codigo_sap: string;
  nombre: string;
  usa_proyectos: boolean;
  activo: boolean;
  created_at: string;
  updated_at: string;
}
interface CecosInsert {
  id?: string;
  codigo_sap: string;
  nombre: string;
  usa_proyectos?: boolean;
  activo?: boolean;
  created_at?: string;
  updated_at?: string;
}

interface OrdenesInternasRow {
  id: string;
  codigo_oi: string;
  nombre: string | null;
  id_ceco: string | null;
  id_hunting_zone: string;
  fy: number | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
  tipo: TipoOrdenInternaDB;
  vigencia_desde: string | null;
  vigencia_hasta: string | null;
}
interface OrdenesInternasInsert {
  id?: string;
  codigo_oi: string;
  nombre?: string | null;
  id_ceco?: string | null;
  id_hunting_zone: string;
  fy?: number | null;
  activo?: boolean;
  created_at?: string;
  updated_at?: string;
  tipo?: TipoOrdenInternaDB;
  vigencia_desde?: string | null;
  vigencia_hasta?: string | null;
}

interface HuntingZonesRow {
  id: string;
  nombre: string;
  tag_principal: string | null;
  color_hex: string | null;
  orden_display: number;
  activo: boolean;
  archivar_automatico: boolean;
  created_at: string;
  updated_at: string;
}
interface HuntingZonesInsert {
  id?: string;
  nombre: string;
  tag_principal?: string | null;
  color_hex?: string | null;
  orden_display?: number;
  activo?: boolean;
  archivar_automatico?: boolean;
  created_at?: string;
  updated_at?: string;
}

interface FacturasPreregistradasRow {
  id: string;
  numero_factura: string;
  proveedor_codigo: string | null;
  proveedor: string | null;
  texto_referencia: string | null;
  fecha_factura: string | null;
  id_oi: string | null;
  id_hunting_zone: string | null;
  fase: string | null;
  motivo: string | null;
  detalle: string | null;
  monto_estimado: number | null;
  moneda: string;
  nota: string | null;
  activo: boolean;
  id_carga: string | null;
  creado_por: string | null;
  created_at: string;
  updated_at: string;
  /** Columna generada (stored): no se inserta ni se actualiza. */
  numero_normalizado: string | null;
  id_ceco: string | null;
}
interface FacturasPreregistradasInsert {
  id?: string;
  numero_factura: string;
  proveedor_codigo?: string | null;
  proveedor?: string | null;
  texto_referencia?: string | null;
  fecha_factura?: string | null;
  id_oi?: string | null;
  id_hunting_zone?: string | null;
  fase?: string | null;
  motivo?: string | null;
  detalle?: string | null;
  monto_estimado?: number | null;
  moneda?: string;
  nota?: string | null;
  activo?: boolean;
  id_carga?: string | null;
  creado_por?: string | null;
  created_at?: string;
  updated_at?: string;
  id_ceco?: string | null;
}

interface PresupuestosRow {
  id: string;
  id_oi: string | null;
  tipo: TipoPresupuestoDB;
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
  created_at: string;
  updated_at: string;
  id_ceco: string | null;
  id_solicitud: string | null;
}
interface PresupuestosInsert {
  id?: string;
  id_oi?: string | null;
  tipo: TipoPresupuestoDB;
  fy: number;
  mes: number;
  quarter?: string | null;
  monto: number;
  cuenta_contable?: string | null;
  descripcion_cuenta?: string | null;
  tipo_gasto?: string | null;
  detalle_gasto?: string | null;
  responsable?: string | null;
  area?: string | null;
  ceco_declarado?: string | null;
  id_carga?: string | null;
  created_at?: string;
  updated_at?: string;
  id_ceco?: string | null;
  id_solicitud?: string | null;
}

interface SolicitudesRow {
  id: string;
  tipo: TipoSolicitudDB;
  estado: EstadoSolicitudDB;
  id_oi: string | null;
  id_ceco: string | null;
  fy: number;
  trimestre: number | null;
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
  updated_at: string;
}
interface SolicitudesInsert {
  id?: string;
  tipo: TipoSolicitudDB;
  estado?: EstadoSolicitudDB;
  id_oi?: string | null;
  id_ceco?: string | null;
  fy: number;
  trimestre?: number | null;
  titulo: string;
  justificacion?: string | null;
  monto_solicitado?: number | null;
  referencia_aprobacion?: string | null;
  nota_resolucion?: string | null;
  creada_por?: string | null;
  resuelta_por?: string | null;
  enviada_at?: string | null;
  resuelta_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface GastosRow {
  id: string;
  fuente: FuenteGastoDB;
  factura: string | null;
  fecha_documento: string;
  proveedor_codigo: string | null;
  proveedor: string | null;
  texto_referencia: string | null;
  grupo_clase_coste: string | null;
  ceco_codigo_raw: string | null;
  oi_codigo_raw: string | null;
  monto_real: number;
  monto_plan_sap: number | null;
  monto_comprometido: number | null;
  id_ceco: string | null;
  id_oi: string | null;
  id_hunting_zone: string | null;
  fase: string | null;
  motivo: string | null;
  detalle: string | null;
  id_factura_preregistrada: string | null;
  origen_hz: OrigenAsignacionDB;
  estado_revision: EstadoRevisionDB;
  nota: string | null;
  /** Columnas generadas (stored): no se insertan ni se actualizan. */
  fy: number | null;
  mes: number | null;
  factura_normalizada: string | null;
  hash_dedupe: string | null;
  id_carga: string | null;
  revisado_por: string | null;
  revisado_at: string | null;
  created_at: string;
  updated_at: string;
}
interface GastosInsert {
  id?: string;
  fuente: FuenteGastoDB;
  factura?: string | null;
  fecha_documento: string;
  proveedor_codigo?: string | null;
  proveedor?: string | null;
  texto_referencia?: string | null;
  grupo_clase_coste?: string | null;
  ceco_codigo_raw?: string | null;
  oi_codigo_raw?: string | null;
  monto_real: number;
  monto_plan_sap?: number | null;
  monto_comprometido?: number | null;
  id_ceco?: string | null;
  id_oi?: string | null;
  id_hunting_zone?: string | null;
  fase?: string | null;
  motivo?: string | null;
  detalle?: string | null;
  id_factura_preregistrada?: string | null;
  origen_hz?: OrigenAsignacionDB;
  estado_revision?: EstadoRevisionDB;
  nota?: string | null;
  id_carga?: string | null;
  revisado_por?: string | null;
  revisado_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface CargasRow {
  id: string;
  tipo: TipoCargaDB;
  nombre_archivo: string;
  hash_archivo: string | null;
  estado: EstadoCargaDB;
  filas_leidas: number;
  filas_insertadas: number;
  filas_duplicadas: number;
  filas_rechazadas: number;
  mensaje: string | null;
  id_usuario: string | null;
  created_at: string;
  finalizada_at: string | null;
}
interface CargasInsert {
  id?: string;
  tipo: TipoCargaDB;
  nombre_archivo: string;
  hash_archivo?: string | null;
  estado?: EstadoCargaDB;
  filas_leidas?: number;
  filas_insertadas?: number;
  filas_duplicadas?: number;
  filas_rechazadas?: number;
  mensaje?: string | null;
  id_usuario?: string | null;
  created_at?: string;
  finalizada_at?: string | null;
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

/** Tabla genérica: el stub de siempre, para todo lo que no está tipado arriba. */
interface TablaGenerica {
  Row: Record<string, Json>;
  Insert: Record<string, Json | undefined>;
  Update: Record<string, Json | undefined>;
  Relationships: [];
}

/**
 * Las 8 tablas tipadas a mano. Separado de `Tables` abajo (en vez de un
 * literal con propiedades nombradas + índice `[key: string]`) porque TS
 * rechaza esa combinación (TS2411) cuando los tipos concretos no son
 * estructuralmente idénticos al stub genérico — la intersección de dos tipos
 * declarados por separado no tiene ese problema.
 */
type TablasConocidas = {
  cecos: { Row: CecosRow; Insert: CecosInsert; Update: Partial<CecosInsert>; Relationships: [] };
  ordenes_internas: {
    Row: OrdenesInternasRow;
    Insert: OrdenesInternasInsert;
    Update: Partial<OrdenesInternasInsert>;
    Relationships: [];
  };
  hunting_zones: {
    Row: HuntingZonesRow;
    Insert: HuntingZonesInsert;
    Update: Partial<HuntingZonesInsert>;
    Relationships: [];
  };
  facturas_preregistradas: {
    Row: FacturasPreregistradasRow;
    Insert: FacturasPreregistradasInsert;
    Update: Partial<FacturasPreregistradasInsert>;
    Relationships: [];
  };
  presupuestos: {
    Row: PresupuestosRow;
    Insert: PresupuestosInsert;
    Update: Partial<PresupuestosInsert>;
    Relationships: [];
  };
  solicitudes: {
    Row: SolicitudesRow;
    Insert: SolicitudesInsert;
    Update: Partial<SolicitudesInsert>;
    Relationships: [];
  };
  gastos: { Row: GastosRow; Insert: GastosInsert; Update: Partial<GastosInsert>; Relationships: [] };
  cargas: { Row: CargasRow; Insert: CargasInsert; Update: Partial<CargasInsert>; Relationships: [] };
};

export type Database = {
  public: {
    Tables: TablasConocidas & Record<string, TablaGenerica>;
    Views: {
      [key: string]: {
        Row: Record<string, Json>;
        Relationships: [];
      };
    };
    Functions: {
      [key: string]: {
        Args: Record<string, unknown>;
        Returns: unknown;
      };
    };
    Enums: {
      [key: string]: string;
    };
    CompositeTypes: Record<string, never>;
  };
};
