"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

const ANCHOS = {
  sm: "sm:max-w-md",
  md: "sm:max-w-xl",
  lg: "sm:max-w-3xl",
  xl: "sm:max-w-4xl",
} as const;

interface Props {
  titulo: string;
  /** Texto bajo el título. */
  descripcion?: ReactNode;
  onCerrar: () => void;
  /** Mientras se procesa, no se cierra con Escape ni tocando el fondo. */
  bloqueado?: boolean;
  ancho?: keyof typeof ANCHOS;
  /**
   * Botón X en el encabezado. Una confirmación no lo necesita: ya tiene
   * "Cancelar", y dos formas de decir lo mismo solo agregan ruido.
   */
  conBotonCerrar?: boolean;
  children: ReactNode;
}

/**
 * Diálogo modal de la app.
 *
 * - El encabezado queda fijo y solo el cuerpo hace scroll (vertical, nunca
 *   horizontal): título y cierre siempre a la vista en formularios largos.
 * - Se cierra con Escape, con la X o tocando el fondo, salvo `bloqueado`.
 * - Bloquea el scroll de la página detrás (en <html>, que es el que se
 *   desplaza) y lleva el foco al primer control.
 * - En pantallas chicas sale desde abajo, a todo el ancho.
 */
export function Modal({
  titulo,
  descripcion,
  onCerrar,
  bloqueado = false,
  ancho = "md",
  conBotonCerrar = true,
  children,
}: Props) {
  const idTitulo = useId();
  const cuerpoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (e.key === "Escape" && !bloqueado) onCerrar();
    }
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, [onCerrar, bloqueado]);

  useEffect(() => {
    const html = document.documentElement;
    const previo = html.style.overflow;
    html.style.overflow = "hidden";
    const primero = cuerpoRef.current?.querySelector<HTMLElement>(
      "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])",
    );
    (primero ?? cuerpoRef.current)?.focus();
    return () => {
      html.style.overflow = previo;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(12,58,87,0.45)] sm:items-center sm:p-6"
      onClick={() => {
        if (!bloqueado) onCerrar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[92svh] w-full ${ANCHOS[ancho]} flex-col overflow-hidden rounded-t-2xl bg-[var(--card)] shadow-2xl sm:rounded-xl`}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
          <div className="min-w-0">
            <h2 id={idTitulo} className="text-base font-semibold text-[var(--ink)] sm:text-lg">
              {titulo}
            </h2>
            {descripcion && <p className="mt-1 text-sm text-[var(--muted)]">{descripcion}</p>}
          </div>
          {conBotonCerrar && (
            <button
              type="button"
              aria-label="Cerrar"
              disabled={bloqueado}
              onClick={onCerrar}
              className="-mr-1 -mt-1 shrink-0 rounded-md p-1.5 text-[var(--muted)] hover:bg-[var(--line-soft)] hover:text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[rgba(46,117,182,0.3)] disabled:opacity-40"
            >
              <X className="size-5" aria-hidden />
            </button>
          )}
        </header>
        <div
          ref={cuerpoRef}
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-5 focus:outline-none"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
