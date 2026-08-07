"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Flujo E — las tres vías de salida del PRD.
 *
 * El PDF se resuelve con el diálogo de impresión del navegador ("Guardar como
 * PDF") en vez de generarlo en el servidor: evita arrastrar un navegador
 * headless al deploy y respeta los saltos de página del CSS de impresión.
 */
export function MenuExportar({
  enPresentacion,
  onAntesDeImprimir,
}: {
  enPresentacion: boolean;
  onAntesDeImprimir: (activo: boolean) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const contenedor = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    };
    document.addEventListener("click", fuera);
    return () => document.removeEventListener("click", fuera);
  }, [abierto]);

  async function descargarHtml() {
    setDescargando(true);
    setAbierto(false);
    try {
      const res = await fetch("/api/exportar/dashboard");
      if (!res.ok) throw new Error("fallo");
      const blob = await res.blob();

      const cabecera = res.headers.get("Content-Disposition") ?? "";
      const nombre =
        /filename="([^"]+)"/.exec(cabecera)?.[1] ?? "Dashboard_Presupuestario_IENN.html";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombre;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.alert("No se pudo generar el HTML. Reinténtalo en unos segundos.");
    } finally {
      setDescargando(false);
    }
  }

  function imprimir() {
    setAbierto(false);
    // Se montan todas las secciones y se le da tiempo a Chart.js a dibujar
    // antes de abrir el diálogo; después se vuelve a la vista por pestañas.
    onAntesDeImprimir(true);
    setTimeout(() => {
      window.print();
      onAntesDeImprimir(false);
    }, 700);
  }

  function alternarPresentacion() {
    setAbierto(false);
    const url = new URL(window.location.href);
    if (enPresentacion) {
      url.searchParams.delete("presentacion");
      if (document.fullscreenElement) void document.exitFullscreen();
    } else {
      url.searchParams.set("presentacion", "1");
      void document.documentElement.requestFullscreen?.().catch(() => {
        /* si el navegador lo bloquea, la vista limpia igual se aplica */
      });
    }
    window.location.href = url.toString();
  }

  return (
    <div className="no-print relative" ref={contenedor}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        disabled={descargando}
        className="rounded-md border border-[rgba(143,180,201,0.35)] bg-[rgba(255,255,255,0.08)] px-3 py-2 text-xs font-semibold text-[#eaf2f7] hover:bg-[rgba(143,180,201,0.2)] disabled:opacity-60"
      >
        {descargando ? "Generando…" : "Exportar ▾"}
      </button>

      {abierto && (
        <div className="absolute right-0 z-50 mt-2 w-72 rounded-lg border border-[var(--line)] bg-white p-1.5 shadow-[0_12px_32px_rgba(12,58,87,0.18)]">
          <OpcionMenu
            titulo="Descargar HTML interactivo"
            detalle="Archivo único que abre sin conexión, con filtros, hovers y tooltips."
            onClick={() => void descargarHtml()}
          />
          <OpcionMenu
            titulo="Descargar PDF ejecutivo"
            detalle="Abre el diálogo de impresión: elige “Guardar como PDF”."
            onClick={imprimir}
          />
          <OpcionMenu
            titulo={enPresentacion ? "Salir del modo presentación" : "Modo presentación"}
            detalle={
              enPresentacion
                ? "Vuelve a la navegación normal."
                : "Pantalla completa, sin menús, solo lectura."
            }
            onClick={alternarPresentacion}
          />
        </div>
      )}
    </div>
  );
}

function OpcionMenu({
  titulo,
  detalle,
  onClick,
}: {
  titulo: string;
  detalle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-md px-3 py-2 text-left hover:bg-[var(--line-soft)]"
    >
      <span className="block text-[13px] font-semibold text-[var(--ink)]">{titulo}</span>
      <span className="mt-0.5 block text-[11px] leading-snug text-[var(--muted)]">
        {detalle}
      </span>
    </button>
  );
}
