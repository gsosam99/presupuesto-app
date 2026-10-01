import { Loader2 } from "lucide-react";

/**
 * Fallback de los loading.tsx: aparece al instante al cambiar de módulo,
 * mientras el servidor arma la página. Tiene la forma aproximada de una
 * pantalla (título, KPIs, tabla) para que el cambio no salte.
 */
export function PantallaCargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <div className="mx-auto w-full max-w-[1300px] px-5 py-8" aria-busy="true">
      <div
        className="flex items-center gap-2 text-sm font-medium text-[var(--muted)]"
        role="status"
      >
        <Loader2 className="size-4 animate-spin text-[var(--blue)]" aria-hidden />
        {texto}
      </div>

      <div aria-hidden className="mt-4 animate-pulse">
        <div className="h-3 w-32 rounded bg-[var(--line)]" />
        <div className="mt-3 h-7 w-72 max-w-full rounded bg-[var(--line)]" />
        <div className="mt-3 h-3 w-[32rem] max-w-full rounded bg-[var(--line-soft)]" />

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-[var(--r)] bg-[var(--card)] shadow-sm" />
          ))}
        </div>

        <div className="mt-8 h-72 rounded-[var(--r)] bg-[var(--card)] shadow-sm" />
      </div>
    </div>
  );
}
