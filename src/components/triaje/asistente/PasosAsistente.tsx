import Link from "next/link";

export const PASOS = [
  "Qué se va a cargar",
  "Rango de fechas",
  "Cruce automático",
  "Match manual",
  "Rezagadas",
  "Resumen",
] as const;

export type NumeroPaso = 1 | 2 | 3 | 4 | 5 | 6;

interface Props {
  actual: NumeroPaso;
  /** Con lote, los pasos 3 a 6 son navegables (la carga ya se escribió). */
  idLote?: string;
  /** Pendientes por paso, para mostrar cuánto falta sin entrar. */
  contadores?: Partial<Record<NumeroPaso, number>>;
  /**
   * Asistente en memoria (carga sin confirmar): los pasos hasta `alcanzado`
   * son botones que llaman a `onIr` en vez de links.
   */
  onIr?: (n: NumeroPaso) => void;
  alcanzado?: NumeroPaso;
  /** Mientras se recalcula el plan no se puede saltar de paso. */
  deshabilitado?: boolean;
}

/**
 * Indicador de pasos del asistente de cruce. En una carga nueva nada se
 * escribe hasta confirmar en el resumen (paso 6): los pasos ya visitados son
 * botones (`onIr`). En un lote ya registrado (`idLote`), los pasos 3 a 6 son
 * links y su estado se deriva de la base.
 */
export function PasosAsistente({
  actual,
  idLote,
  contadores,
  onIr,
  alcanzado,
  deshabilitado = false,
}: Props) {
  return (
    <ol className="flex flex-wrap gap-x-1 gap-y-2 text-xs" aria-label="Pasos del asistente">
      {PASOS.map((titulo, i) => {
        const n = (i + 1) as NumeroPaso;
        const hecho = n < actual;
        const esActual = n === actual;
        const navegable = idLote !== undefined && n >= 3 && !esActual;
        const clicable = onIr !== undefined && n <= (alcanzado ?? actual) && !esActual;
        const contador = contadores?.[n];

        const contenido = (
          <>
            <span
              className={
                "inline-flex size-5 items-center justify-center rounded-full text-[11px] font-bold " +
                (esActual
                  ? "bg-[var(--navy)] text-white"
                  : hecho
                    ? "bg-[var(--ok)] text-white"
                    : "bg-[var(--line)] text-[var(--muted)]")
              }
            >
              {hecho ? "✓" : n}
            </span>
            <span className={esActual ? "font-semibold text-[var(--ink)]" : ""}>{titulo}</span>
            {contador !== undefined && contador > 0 && (
              <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">
                {contador}
              </span>
            )}
          </>
        );

        return (
          <li key={titulo} className="flex items-center">
            {clicable ? (
              <button
                type="button"
                disabled={deshabilitado}
                onClick={() => onIr(n)}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[var(--muted)] hover:bg-[var(--line-soft)] disabled:cursor-wait"
              >
                {contenido}
              </button>
            ) : navegable ? (
              <Link
                href={`/triaje/lote/${idLote}?paso=${n}`}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[var(--muted)] hover:bg-[var(--line-soft)]"
              >
                {contenido}
              </Link>
            ) : (
              <span
                aria-current={esActual ? "step" : undefined}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[var(--muted)]"
              >
                {contenido}
              </span>
            )}
            {n < PASOS.length && (
              <span aria-hidden className="text-[var(--line)]">
                ›
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
