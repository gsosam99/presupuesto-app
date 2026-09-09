"use client";

import { useRef, useState, type ReactNode } from "react";

import {
  TablaMaestra,
  type CampoMaestra,
  type FilaMaestra,
} from "@/components/maestras/TablaMaestra";

export interface SeccionMaestra {
  /** Clave estable, se usa para los ids de accesibilidad. */
  id: string;
  titulo: string;
  descripcion?: ReactNode;
  entidad: string;
  campos: CampoMaestra[];
  filas: FilaMaestra[];
  etiquetaAlta: string;
}

interface Props {
  secciones: SeccionMaestra[];
}

/**
 * Pestañas de las tablas maestras.
 *
 * La pestaña activa vive en estado local y no en un search param: la página es
 * `force-dynamic`, así que un param dispararía un round-trip completo (las
 * cuatro queries) por cada click, para lo que es un simple cambio de vista.
 * Además el estado local sobrevive al `router.refresh()` que TablaMaestra
 * dispara tras cada guardado, así que guardar no devuelve a la primera pestaña.
 *
 * Sólo se monta el panel activo, que es lo que evita hidratar ~70 filas de
 * inputs vivos de una vez. La contrapartida: cambiar de pestaña descarta los
 * cambios sin guardar de la anterior. Es la semántica correcta —abandonaste esa
 * tabla— pero conviene tenerlo presente.
 */
export function PanelMaestras({ secciones }: Props) {
  const [activa, setActiva] = useState(secciones[0]?.id ?? "");
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function alTeclado(e: React.KeyboardEvent<HTMLDivElement>) {
    const teclas = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!teclas.includes(e.key)) return;
    e.preventDefault();

    const i = secciones.findIndex((s) => s.id === activa);
    const destino =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? secciones.length - 1
          : e.key === "ArrowLeft"
            ? (i - 1 + secciones.length) % secciones.length
            : (i + 1) % secciones.length;

    const siguiente = secciones[destino];
    if (!siguiente) return;
    setActiva(siguiente.id);
    refs.current[siguiente.id]?.focus();
  }

  const seccion = secciones.find((s) => s.id === activa) ?? secciones[0];
  if (!seccion) return null;

  return (
    <div>
      <div role="tablist" aria-label="Tablas maestras" className="ui-tabs" onKeyDown={alTeclado}>
        {secciones.map((s) => {
          const seleccionada = s.id === seccion.id;
          return (
            <button
              key={s.id}
              ref={(el) => {
                refs.current[s.id] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${s.id}`}
              aria-controls={`panel-${s.id}`}
              aria-selected={seleccionada}
              tabIndex={seleccionada ? 0 : -1}
              onClick={() => setActiva(s.id)}
              className="ui-tab"
            >
              {s.titulo}
              <span className="ml-1.5 font-normal text-[var(--muted)]">({s.filas.length})</span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`panel-${seccion.id}`}
        aria-labelledby={`tab-${seccion.id}`}
        className="mt-6"
      >
        {seccion.descripcion && (
          <p className="mb-3 text-sm text-[var(--muted)]">{seccion.descripcion}</p>
        )}
        <TablaMaestra
          entidad={seccion.entidad}
          campos={seccion.campos}
          filas={seccion.filas}
          etiquetaAlta={seccion.etiquetaAlta}
        />
      </div>
    </div>
  );
}
