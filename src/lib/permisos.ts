/**
 * Matriz de roles y permisos.
 *
 * Es la única fuente de la segmentación en la app: la usan los guards de
 * src/lib/auth.ts (páginas y Route Handlers) y el sidebar. El RLS de la base
 * (schema.sql, sección 16) replica la misma matriz como última barrera.
 *
 * Todos los roles pueden LEER toda la data: la segmentación es sobre qué
 * puede ESCRIBIR cada uno.
 */

import type { RolApp } from "@/types";

export type Permiso =
  /** Registrar, editar, eliminar facturas pre-registradas y deshacer cruces. */
  | "facturas:editar"
  /** Match manual y completar rezagadas en la Sala de Triaje. */
  | "triaje:editar"
  /** Cargar reportes de SAP (asistente, pasos 1–2) y revertir cargas. */
  | "cargas:sap"
  /** Cargar presupuesto Plan / Extra plan desde Excel. */
  | "presupuestos:cargar"
  /** Crear solicitudes, enviarlas y devolverlas a borrador. */
  | "solicitudes:crear"
  /** Aprobar, rechazar o revertir la aprobación de una solicitud. */
  | "solicitudes:resolver"
  /** Registrar y editar ingresos. */
  | "ingresos:editar"
  /** Órdenes internas, Hunting Zones, CeCos y años fiscales. */
  | "maestras:editar"
  /** Alta de miembros del equipo y asignación de roles. */
  | "equipo:editar";

export const ETIQUETA_ROL: Record<RolApp, string> = {
  admin: "Administrador",
  finanzas: "Finanzas",
  analista: "Analista",
  lector: "Lector",
};

const OPERACION: Permiso[] = ["facturas:editar", "triaje:editar", "solicitudes:crear"];

export const PERMISOS: Record<RolApp, readonly Permiso[]> = {
  admin: [
    ...OPERACION,
    "cargas:sap",
    "presupuestos:cargar",
    "solicitudes:resolver",
    "ingresos:editar",
    "maestras:editar",
    "equipo:editar",
  ],
  finanzas: [
    ...OPERACION,
    "cargas:sap",
    "presupuestos:cargar",
    "solicitudes:resolver",
    "ingresos:editar",
  ],
  analista: OPERACION,
  lector: [],
};

const ROLES: readonly RolApp[] = ["admin", "finanzas", "analista", "lector"];

/** Valida un valor crudo (p. ej. el resultado de rol_actual()) como rol. */
export function aRolApp(valor: unknown): RolApp | null {
  return ROLES.find((r) => r === valor) ?? null;
}

export function tienePermiso(rol: RolApp | null, permiso: Permiso): boolean {
  return rol !== null && PERMISOS[rol].includes(permiso);
}
