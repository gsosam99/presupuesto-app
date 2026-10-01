import type { ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";

/** peligro: acciones destructivas (eliminar, borrar, deshacer). */
type Variante = "primario" | "secundario" | "peligro";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  /** Acción en curso: spinner a la izquierda y el botón deshabilitado. */
  cargando?: boolean;
}

const ESTILOS: Record<Variante, string> = {
  primario:
    "bg-[var(--navy)] text-white hover:opacity-90 disabled:bg-[var(--line)] disabled:text-[var(--muted)]",
  peligro:
    "bg-[var(--bad)] text-white hover:opacity-90 disabled:bg-[var(--line)] disabled:text-[var(--muted)]",
  secundario:
    "bg-white text-[var(--ink)] border border-[var(--line)] hover:bg-[var(--line-soft)] disabled:text-[var(--muted)]",
};

export function Button({
  variante = "primario",
  cargando = false,
  className = "",
  disabled,
  children,
  ...props
}: Props) {
  return (
    <button
      {...props}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      className={
        "inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium " +
        "transition-colors focus:outline-none focus:ring-2 focus:ring-[rgba(46,117,182,0.3)] " +
        "disabled:cursor-not-allowed " +
        ESTILOS[variante] +
        (className ? ` ${className}` : "")
      }
    >
      {cargando && <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
