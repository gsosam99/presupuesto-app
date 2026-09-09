/**
 * Estructura de la navegación principal, agrupada por flujo de uso real:
 *
 *   Gastos: Facturas (pre-registro continuo) → Cargas (el disparador mensual:
 *   carga el reporte de SAP y cruza contra lo pre-registrado) → Triaje
 *   (completa lo que quedó sin resolver tras la carga) → Archivados (papelera,
 *   la más pasiva).
 *
 *   Presupuesto: Presupuestos (la data base) → Fondos (vista derivada de lo
 *   disponible — y el origen real de los links "Pedir prórroga"/"Solicitar
 *   extra plan" en fondos/page.tsx) → Solicitudes (la acción que nace de ahí).
 *
 * El bloque sin título de arriba junta las pantallas que NO son un flujo:
 * Dashboard (sólo lectura) e Ingresos (carga manual, sin pipeline detrás). Un
 * grupo titulado "Ingresos" con un único item "Ingresos" sería un encabezado
 * repitiendo a su propio hijo. Configuración no vive acá: es administración de
 * maestras, se ancla aparte al pie del sidebar.
 */

import {
  Archive,
  FileSignature,
  FileText,
  LayoutDashboard,
  ListChecks,
  PiggyBank,
  TrendingUp,
  Upload,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface ItemNav {
  href: string;
  etiqueta: string;
  icono: LucideIcon;
}

export interface GrupoNav {
  /** null = sin encabezado de grupo (ej. Dashboard). */
  titulo: string | null;
  items: ItemNav[];
}

export const NAVEGACION: GrupoNav[] = [
  {
    titulo: null,
    items: [
      { href: "/dashboard", etiqueta: "Dashboard", icono: LayoutDashboard },
      { href: "/ingresos", etiqueta: "Ingresos", icono: TrendingUp },
    ],
  },
  {
    titulo: "Gastos",
    items: [
      { href: "/facturas", etiqueta: "Facturas", icono: FileText },
      { href: "/cargas", etiqueta: "Cargas", icono: Upload },
      { href: "/triaje", etiqueta: "Triaje", icono: ListChecks },
      { href: "/archivados", etiqueta: "Archivados", icono: Archive },
    ],
  },
  {
    titulo: "Presupuesto",
    items: [
      { href: "/presupuestos", etiqueta: "Presupuestos", icono: Wallet },
      { href: "/fondos", etiqueta: "Fondos", icono: PiggyBank },
      { href: "/solicitudes", etiqueta: "Solicitudes", icono: FileSignature },
    ],
  },
];
