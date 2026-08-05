import Link from "next/link";

import { requireAuth } from "@/lib/auth";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const usuario = await requireAuth();

  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/cargas" className="text-sm font-semibold text-slate-900">
              IENN Gastos
            </Link>
            <nav className="flex items-center gap-4 text-sm text-slate-600">
              <Link href="/cargas" className="hover:text-slate-900">
                Cargas
              </Link>
              <Link href="/facturas" className="hover:text-slate-900">
                Facturas
              </Link>
              <Link href="/triaje" className="hover:text-slate-900">
                Triaje
              </Link>
              <Link href="/presupuestos" className="hover:text-slate-900">
                Presupuestos
              </Link>
            </nav>
          </div>
          <span className="truncate text-xs text-slate-500">{usuario.email}</span>
        </div>
      </header>

      <div className="flex-1">{children}</div>
    </>
  );
}
