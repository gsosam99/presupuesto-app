"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const EVENTO_INICIO = "ienn:navegacion-inicio";

/** Tope de seguridad: si la URL nunca cambia (link a la misma página), la barra se va sola. */
const TOPE_MS = 15_000;

/**
 * Para navegaciones por código (router.push tras guardar): enciende la barra
 * igual que un click en un link.
 */
export function avisarNavegacion(): void {
  window.dispatchEvent(new Event(EVENTO_INICIO));
}

function urlActual(): string {
  return window.location.pathname + window.location.search;
}

/**
 * Barra de progreso fija arriba mientras se navega entre pantallas. Las
 * páginas son dinámicas (datos de Supabase en cada visita) y sin esto un click
 * no daba ninguna señal hasta que el servidor respondía.
 *
 * Se enciende con cualquier click en un link interno (o con avisarNavegacion)
 * y se apaga sola cuando cambia la URL: el estado guarda DESDE qué URL se
 * salió, y la barra se ve solo mientras la URL siga siendo esa.
 */
export function BarraNavegacion() {
  const pathname = usePathname();
  const params = useSearchParams();
  const busqueda = params.toString();
  const actual = pathname + (busqueda ? `?${busqueda}` : "");

  const [desde, setDesde] = useState<string | null>(null);
  const activa = desde !== null && desde === actual;

  useEffect(() => {
    function alClick(e: MouseEvent) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const enlace = (e.target as Element | null)?.closest?.("a");
      if (!enlace || enlace.hasAttribute("download")) return;
      if (enlace.target && enlace.target !== "_self") return;

      const destino = new URL(enlace.href, window.location.href);
      if (destino.origin !== window.location.origin) return;
      // Mismo lugar (o solo cambia el #ancla): no hay navegación que esperar.
      if (destino.pathname + destino.search === urlActual()) return;

      setDesde(urlActual());
    }
    function alAviso() {
      setDesde(urlActual());
    }

    document.addEventListener("click", alClick);
    window.addEventListener(EVENTO_INICIO, alAviso);
    return () => {
      document.removeEventListener("click", alClick);
      window.removeEventListener(EVENTO_INICIO, alAviso);
    };
  }, []);

  useEffect(() => {
    if (!activa) return;
    const t = window.setTimeout(() => setDesde(null), TOPE_MS);
    return () => window.clearTimeout(t);
  }, [activa]);

  return (
    <div
      role="progressbar"
      aria-label="Cargando la pantalla"
      aria-hidden={!activa}
      className={`barra-navegacion ${activa ? "is-activa" : ""}`}
    />
  );
}
