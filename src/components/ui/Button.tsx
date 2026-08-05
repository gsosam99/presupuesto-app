import type { ButtonHTMLAttributes } from "react";

type Variante = "primario" | "secundario";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
}

const ESTILOS: Record<Variante, string> = {
  primario:
    "bg-[var(--navy)] text-white hover:opacity-90 disabled:bg-[var(--line)] disabled:text-[var(--muted)]",
  secundario:
    "bg-white text-[var(--ink)] border border-[var(--line)] hover:bg-[var(--line-soft)] disabled:text-[var(--muted)]",
};

export function Button({ variante = "primario", className = "", ...props }: Props) {
  return (
    <button
      {...props}
      className={
        "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium " +
        "transition-colors focus:outline-none focus:ring-2 focus:ring-[rgba(46,117,182,0.3)] " +
        "disabled:cursor-not-allowed " +
        ESTILOS[variante] +
        (className ? ` ${className}` : "")
      }
    />
  );
}
