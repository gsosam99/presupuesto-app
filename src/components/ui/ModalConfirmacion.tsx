"use client";

import type { ReactNode } from "react";

import { Modal } from "@/components/ui/Modal";

interface Props {
  titulo: string;
  /** Qué va a pasar si se confirma. */
  children: ReactNode;
  textoConfirmar: string;
  /** Acción destructiva (eliminar, deshacer): el botón va en rojo. */
  peligro?: boolean;
  procesando?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

/**
 * Confirmación antes de una acción que no se puede deshacer fácilmente. Reemplaza
 * a window.confirm(), que el navegador puede bloquear y no sigue el estilo de la app.
 */
export function ModalConfirmacion({
  titulo,
  children,
  textoConfirmar,
  peligro = false,
  procesando = false,
  onConfirmar,
  onCancelar,
}: Props) {
  return (
    <Modal
      titulo={titulo}
      onCerrar={onCancelar}
      bloqueado={procesando}
      ancho="sm"
      conBotonCerrar={false}
    >
      <div className="text-sm text-[var(--ink-soft)]">{children}</div>
      {/* En móvil los botones apilados a todo el ancho, con la acción principal
          arriba (más cerca del pulgar); en escritorio, en fila a la derecha. */}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          disabled={procesando}
          onClick={onCancelar}
          className="rounded-md border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--ink)] hover:bg-[var(--line-soft)] focus:outline-none focus:ring-2 focus:ring-[rgba(46,117,182,0.3)] disabled:opacity-50 sm:py-2"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={procesando}
          onClick={onConfirmar}
          className={
            "rounded-md px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[rgba(46,117,182,0.3)] disabled:opacity-50 sm:py-2 " +
            (peligro ? "bg-[var(--bad)]" : "bg-[var(--navy)]")
          }
        >
          {procesando ? "Procesando…" : textoConfirmar}
        </button>
      </div>
    </Modal>
  );
}
