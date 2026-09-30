"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

const ANCHOS = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-4xl",
} as const;

interface Props {
  titulo: string;
  /** Texto bajo el título. */
  descripcion?: ReactNode;
  onCerrar: () => void;
  /** Mientras se procesa, no se cierra con Escape ni tocando el fondo. */
  bloqueado?: boolean;
  ancho?: keyof typeof ANCHOS;
  children: ReactNode;
}

/**
 * Diálogo modal de la app. Se cierra con Escape, con el botón "Cerrar" o
 * tocando el fondo; bloquea el scroll de la página y lleva el foco adentro.
 * En pantallas chicas sale desde abajo, a todo el ancho.
 */
export function Modal({
  titulo,
  descripcion,
  onCerrar,
  bloqueado = false,
  ancho = "md",
  children,
}: Props) {
  const idTitulo = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (e.key === "Escape" && !bloqueado) onCerrar();
    }
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, [onCerrar, bloqueado]);

  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Foco al primer control del diálogo (o al panel, si no hay ninguno).
    const primero = panelRef.current?.querySelector<HTMLElement>(
      "input, select, textarea, button:not([data-cerrar])",
    );
    (primero ?? panelRef.current)?.focus();
    return () => {
      document.body.style.overflow = previo;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      onClick={() => {
        if (!bloqueado) onCerrar();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`max-h-[92svh] w-full ${ANCHOS[ancho]} overflow-y-auto rounded-t-xl bg-[var(--canvas)] p-5 shadow-xl focus:outline-none sm:rounded-xl`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id={idTitulo} className="text-lg font-semibold text-[var(--ink)]">
              {titulo}
            </h2>
            {descripcion && <p className="mt-1 text-sm text-[var(--muted)]">{descripcion}</p>}
          </div>
          <button
            type="button"
            data-cerrar
            disabled={bloqueado}
            onClick={onCerrar}
            className="rounded-md px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--line-soft)] disabled:opacity-40"
          >
            Cerrar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
