import type { ButtonHTMLAttributes } from "react";

type Variante = "primario" | "secundario";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
}

const ESTILOS: Record<Variante, string> = {
  primario:
    "bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500",
  secundario:
    "bg-white text-slate-900 border border-slate-300 hover:bg-slate-50 disabled:text-slate-400",
};

export function Button({ variante = "primario", className = "", ...props }: Props) {
  return (
    <button
      {...props}
      className={
        "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium " +
        "transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 " +
        "disabled:cursor-not-allowed " +
        ESTILOS[variante] +
        (className ? ` ${className}` : "")
      }
    />
  );
}
