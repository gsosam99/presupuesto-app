"use client";

/**
 * Wrapper cliente para diferir la carga de DashboardIENN (y de chart.js, que
 * importa a nivel de módulo) fuera del bundle inicial. dashboard/page.tsx es
 * un Server Component async: next/dynamic con `ssr: false` no puede vivir
 * ahí directamente, necesita este límite "use client" intermedio.
 */

import dynamic from "next/dynamic";

const DashboardIENN = dynamic(
  () => import("./DashboardIENN").then((m) => m.DashboardIENN),
  { ssr: false, loading: () => <p className="px-6 py-16 text-center text-sm text-slate-500">Cargando…</p> },
);

export { DashboardIENN as DashboardIENNCliente };
