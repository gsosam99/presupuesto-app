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
    <Modal titulo={titulo} onCerrar={onCancelar} bloqueado={procesando} ancho="sm">
      <div className="text-sm text-[var(--ink-soft)]">{children}</div>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={procesando}
          onClick={onCancelar}
          className="rounded-md border border-[var(--line)] bg-white px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--line-soft)] disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={procesando}
          onClick={onConfirmar}
          className={
            "rounded-md px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 " +
            (peligro ? "bg-[var(--bad)]" : "bg-[var(--navy)]")
          }
        >
          {procesando ? "Procesando…" : textoConfirmar}
        </button>
      </div>
    </Modal>
  );
}
