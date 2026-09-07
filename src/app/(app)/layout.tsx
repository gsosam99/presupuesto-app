import Link from "next/link";

import { BotonSalir } from "@/components/auth/BotonSalir";
import { requireAuth } from "@/lib/auth";

const NAVEGACION = [
  ["/dashboard", "Dashboard"],
  ["/cargas", "Cargas"],
  ["/facturas", "Facturas"],
  ["/triaje", "Triaje"],
  ["/fondos", "Fondos"],
  ["/solicitudes", "Solicitudes"],
  ["/archivados", "Archivados"],
  ["/presupuestos", "Presupuestos"],
  ["/configuracion", "Configuración"],
] as const;

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const usuario = await requireAuth();

  return (
    <>
      {/* Misma barra navy del dashboard aprobado, para toda la app. */}
      <header className="app-nav no-print relative bg-[var(--navy)]">
        <div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center justify-between gap-4 px-5 py-3">
          <div className="flex flex-wrap items-center gap-6">
            <Link href="/dashboard" className="leading-tight">
              <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-[#8fb4c9]">
                Empresas Polar
              </span>
              <span className="block text-sm font-extrabold text-white">IENN Gastos</span>
            </Link>

            <nav className="flex flex-nowrap items-center gap-1 overflow-x-auto">
              {NAVEGACION.map(([href, etiqueta]) => (
                <Link
                  key={href}
                  href={href}
                  className="whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-semibold text-[#b9cedc] transition-colors hover:bg-[rgba(143,180,201,0.15)] hover:text-white"
                >
                  {etiqueta}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden truncate text-[11px] text-[#8fb4c9] sm:block">
              {usuario.email}
            </span>
            <BotonSalir />
          </div>
        </div>

        <span
          aria-hidden
          className="absolute inset-x-5 bottom-0 h-[2px] bg-[linear-gradient(90deg,var(--blue),var(--cyan)_55%,var(--gold))]"
        />
      </header>

      <div className="flex-1">{children}</div>
    </>
  );
}
