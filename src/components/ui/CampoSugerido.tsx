"use client";

import { useId, type InputHTMLAttributes } from "react";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "list"> {
  /** Valores ya registrados, ordenados por frecuencia de uso. */
  sugerencias?: readonly string[];
  /**
   * Id de un <datalist> compartido. En tablas largas hay que usarlo: montar un
   * datalist por celda duplicaría el catálogo cientos de veces en el DOM.
   */
  idLista?: string;
}

const CLASE_BASE =
  "block w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300";

/**
 * Input de texto libre con sugerencias de valores ya usados.
 *
 * No restringe: el usuario puede escribir un valor nuevo. El objetivo es evitar
 * errores de tipeo que después impidan agrupar ("Traslados" vs "traslados "),
 * no cerrar el catálogo.
 */
export function CampoSugerido({ sugerencias, idLista, className, ...props }: Props) {
  const idPropio = useId();
  const compartido = idLista !== undefined;
  const id = compartido ? idLista : idPropio;

  return (
    <>
      <input
        {...props}
        list={id}
        autoComplete="off"
        className={className ?? CLASE_BASE}
      />
      {!compartido && (
        <datalist id={id}>
          {(sugerencias ?? []).map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </>
  );
}

/** Datalist compartido por muchas celdas. Se monta una sola vez por campo. */
export function ListaSugerencias({
  id,
  sugerencias,
}: {
  id: string;
  sugerencias: readonly string[];
}) {
  return (
    <datalist id={id}>
      {sugerencias.map((s) => (
        <option key={s} value={s} />
      ))}
    </datalist>
  );
}
