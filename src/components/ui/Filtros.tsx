import type { ReactNode } from "react";

const ANCHOS = {
  /** Búsqueda: toma el espacio que sobra. */
  flexible: "min-w-0 flex-1 basis-full sm:basis-64",
  select: "w-full sm:w-48",
  fecha: "w-full sm:w-40",
} as const;

/**
 * Barra de filtros de las tablas. Los campos se acomodan en una fila y saltan
 * de línea cuando no hay espacio, en vez de apretarse en una grilla fija que
 * se desborda del contenedor. En mobile cada campo ocupa el ancho completo.
 */
export function BarraFiltros({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-wrap items-end gap-x-3 gap-y-2 ${className ?? ""}`}>{children}</div>
  );
}

/** Un campo de filtro con su etiqueta visible arriba. */
export function CampoFiltro({
  etiqueta,
  ancho = "select",
  children,
}: {
  etiqueta: string;
  ancho?: keyof typeof ANCHOS;
  children: ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 ${ANCHOS[ancho]}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        {etiqueta}
      </span>
      {children}
    </label>
  );
}
