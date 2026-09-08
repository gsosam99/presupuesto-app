"use client";

import { useState, useTransition } from "react";
import { usePathname } from "next/navigation";

import { esRutaActiva } from "@/components/nav/Sidebar";
import { fyEtiqueta } from "@/lib/fiscal";
import { fijarFySeleccionado } from "@/lib/fiscal-seleccionado";

interface Props {
  anios: Array<{ fy: number; etiqueta: string }>;
  seleccionado: number;
  colapsado: boolean;
}

/** El FY no aplica en el Dashboard (rango libre propio) ni en Configuración (maestras universales). */
const RUTAS_SIN_SELECTOR = ["/dashboard", "/configuracion"];

export function SelectorAnioFiscal({ anios, seleccionado, colapsado }: Props) {
  const pathname = usePathname();
  const [pendiente, iniciarTransicion] = useTransition();

  // El valor se mantiene local para que el cambio se vea al instante, y se
  // resincroniza cuando el servidor confirma el FY nuevo (o si la acción no se
  // aplicó, vuelve al real). Se ajusta durante el render y no en un efecto,
  // mismo patrón que `pathnameAnterior` en Sidebar.tsx.
  const [seleccionadoAnterior, setSeleccionadoAnterior] = useState(seleccionado);
  const [valor, setValor] = useState(seleccionado);
  if (seleccionado !== seleccionadoAnterior) {
    setSeleccionadoAnterior(seleccionado);
    setValor(seleccionado);
  }

  if (RUTAS_SIN_SELECTOR.some((r) => esRutaActiva(pathname, r))) return null;

  // El FY seleccionado puede no estar todavía en `anios` — p. ej. un FY
  // recién iniciado que nadie dio de alta en Configuración. Sin esto, el
  // <select> cae en otra opción visualmente sin avisar, aunque la página
  // siga filtrando por el FY real seleccionado.
  const opciones = anios.some((a) => a.fy === valor)
    ? anios
    : [...anios, { fy: valor, etiqueta: fyEtiqueta(valor) }].sort((a, b) => b.fy - a.fy);

  // Se llama la Server Action directo, sin envolver el <select> en un <form>:
  // React 19 hace form.reset() al terminar una acción de formulario, y ese
  // reset devuelve el <select> a la opción marcada en el HTML del servidor
  // (la anterior) por debajo de React, que no re-renderiza porque su estado
  // ya cambió. Ese era el "se vuelve solo al valor de antes".
  function alCambiar(fyNuevo: number): void {
    setValor(fyNuevo);
    iniciarTransicion(async () => {
      await fijarFySeleccionado(fyNuevo);
    });
  }

  return (
    <div className={colapsado ? "px-1" : "px-2.5"}>
      <select
        name="fy"
        value={valor}
        onChange={(e) => alCambiar(Number(e.target.value))}
        aria-label="Año fiscal"
        aria-busy={pendiente}
        title={colapsado ? `FY ${valor}` : undefined}
        className={
          "w-full rounded-md border border-[rgba(143,180,201,0.35)] bg-[rgba(143,180,201,0.12)] " +
          "py-1.5 text-[13px] font-semibold text-white transition-opacity focus:outline-none " +
          "focus:ring-2 focus:ring-[rgba(255,255,255,0.3)] " +
          (pendiente ? "opacity-60 " : "") +
          (colapsado ? "px-1 text-center" : "px-2")
        }
      >
        {opciones.map((a) => (
          <option key={a.fy} value={a.fy} className="text-[var(--ink)]">
            {colapsado ? a.etiqueta : `FY ${a.etiqueta}`}
          </option>
        ))}
      </select>
    </div>
  );
}
