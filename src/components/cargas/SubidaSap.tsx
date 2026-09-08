"use client";

import { useCallback, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";

import {
  ModalPrevioCarga,
  type ArchivoPrevio,
  type FiltroElegido,
} from "@/components/cargas/ModalPrevioCarga";
import { Button } from "@/components/ui/Button";
import { moneda } from "@/lib/format";

interface Resumen {
  idCarga: string;
  nombreArchivo: string;
  layout: string;
  filasLeidas: number;
  filasSubtotal: number;
  insertadas: number;
  duplicadas: number;
  rechazadas: number;
  aprobadas: number;
  pendientes: number;
  archivadas: number;
  conMatchFactura: number;
  facturasAmbiguas: number;
  conTagInferido: number;
  montoReal: number;
  montoArchivo: number;
  totalDeclarado: number | null;
  deltaTotal: number | null;
  omitidasPorFecha: number;
  omitidasPorProbable: number;
  oisDesconocidas: string[];
}

interface Respuesta {
  resumenes: Resumen[];
  errores: Array<{ archivo: string; motivo: string }>;
  error?: string;
}

export function SubidaSap() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [arrastrando, setArrastrando] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [previas, setPrevias] = useState<ArchivoPrevio[] | null>(null);
  const [pendientes, setPendientes] = useState<File[]>([]);
  const [respuesta, setRespuesta] = useState<Respuesta | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  /** Paso 1: analizar sin escribir y abrir el modal de revisión. */
  const analizar = useCallback(async (archivos: FileList | File[]) => {
    const lista = Array.from(archivos);
    if (lista.length === 0) return;

    setAnalizando(true);
    setErrorGeneral(null);
    setRespuesta(null);

    try {
      const formData = new FormData();
      for (const a of lista) formData.append("archivos", a);

      const res = await fetch("/api/cargas/sap/previsualizar", {
        method: "POST",
        body: formData,
      });
      const json = (await res.json()) as { previas?: ArchivoPrevio[]; error?: string };

      if (!res.ok || !json.previas) {
        setErrorGeneral(json.error ?? "No se pudo analizar la carga.");
        return;
      }

      setPendientes(lista);
      setPrevias(json.previas);
    } catch {
      setErrorGeneral("No se pudo conectar con el servidor.");
    } finally {
      setAnalizando(false);
    }
  }, []);

  /** Paso 2: cargar de verdad, con el acotamiento confirmado en el modal. */
  const confirmar = useCallback(
    async (filtro: FiltroElegido) => {
      setSubiendo(true);
      setErrorGeneral(null);

      try {
        const formData = new FormData();
        for (const a of pendientes) formData.append("archivos", a);
        if (filtro.desde) formData.append("desde", filtro.desde);
        if (filtro.hasta) formData.append("hasta", filtro.hasta);
        if (filtro.omitirProbables) formData.append("omitirProbables", "true");
        // El guardia de "este archivo ya se cargó" lo cubre el modal, que
        // muestra la fecha de la carga previa antes de llegar acá.
        formData.append("forzar", "true");

        const res = await fetch("/api/cargas/sap", { method: "POST", body: formData });
        const json = (await res.json()) as Respuesta;

        if (!res.ok) {
          setErrorGeneral(json.error ?? "No se pudo procesar la carga.");
          return;
        }

        setPrevias(null);
        setPendientes([]);
        setRespuesta(json);
        router.refresh();
      } catch {
        setErrorGeneral("No se pudo conectar con el servidor.");
      } finally {
        setSubiendo(false);
      }
    },
    [pendientes, router],
  );

  function cancelar() {
    setPrevias(null);
    setPendientes([]);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastrando(false);
    if (!analizando && !subiendo) void analizar(e.dataTransfer.files);
  }

  const ocupado = analizando || subiendo;

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={handleDrop}
        className={
          "rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors " +
          (arrastrando ? "border-slate-500 bg-slate-100" : "border-slate-300 bg-white")
        }
      >
        <p className="text-sm text-slate-600">
          Arrastra acá los <span className="font-medium text-slate-900">.xls</span> de SAP,
          o
        </p>

        <Button
          type="button"
          variante="secundario"
          className="mt-3"
          disabled={ocupado}
          onClick={() => inputRef.current?.click()}
        >
          {analizando ? "Analizando…" : "Elegir archivos"}
        </Button>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xls,.xlsx,.htm,.html"
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) void analizar(e.target.files);
            e.target.value = "";
          }}
        />

        <p className="mt-3 text-xs text-slate-500">
          Puedes soltar los dos reportes (CeCo y OI) a la vez. Máximo 25 MB por archivo.
          Antes de escribir nada verás qué trae cada archivo y podrás acotar el rango.
        </p>
      </div>

      {previas && (
        <ModalPrevioCarga
          previas={previas}
          procesando={subiendo}
          onCancelar={cancelar}
          onConfirmar={(f) => void confirmar(f)}
        />
      )}

      {errorGeneral && (
        <p role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {errorGeneral}
        </p>
      )}

      {respuesta?.errores.map((e) => (
        <p
          key={e.archivo}
          className="mt-4 rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          <span className="font-medium">{e.archivo}</span>: {e.motivo}
        </p>
      ))}

      {respuesta?.resumenes.map((r) => (
        <article
          key={r.idCarga}
          className="mt-4 rounded-lg border border-slate-200 bg-white p-4"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-medium text-slate-900">{r.nombreArchivo}</h3>
            <span className="text-xs text-slate-500">
              {r.layout === "sap_ceco" ? "Reporte por Centro de Costo" : "Reporte por Orden Interna"}
            </span>
          </header>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
            <Dato etiqueta="Insertadas" valor={r.insertadas} destacado />
            <Dato etiqueta="Duplicadas" valor={r.duplicadas} />
            <Dato etiqueta="Descartadas" valor={r.rechazadas} />
            <Dato etiqueta="Subtotales SAP" valor={r.filasSubtotal} />
            <Dato etiqueta="Aprobadas" valor={r.aprobadas} />
            <Dato etiqueta="A triaje" valor={r.pendientes} />
            <Dato etiqueta="Archivadas" valor={r.archivadas} />
            <Dato etiqueta="Cruce por factura" valor={r.conMatchFactura} destacado />
          </dl>

          {(r.omitidasPorFecha > 0 || r.omitidasPorProbable > 0) && (
            <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
              Se dejaron fuera{" "}
              {r.omitidasPorFecha > 0 && (
                <>
                  <strong>{r.omitidasPorFecha}</strong> filas por el rango de fechas
                </>
              )}
              {r.omitidasPorFecha > 0 && r.omitidasPorProbable > 0 && " y "}
              {r.omitidasPorProbable > 0 && (
                <>
                  <strong>{r.omitidasPorProbable}</strong> por ser probables repetidos
                </>
              )}
              .
            </p>
          )}

          <p className="mt-4 text-sm text-slate-600">
            Monto Real cargado:{" "}
            <span className="font-medium text-slate-900">{moneda.format(r.montoReal)}</span>
            {r.totalDeclarado !== null && (
              <>
                {" · "}total del archivo según SAP: {moneda.format(r.totalDeclarado)}
                {r.deltaTotal !== null && r.deltaTotal > 0.005 * r.filasLeidas ? (
                  <span className="ml-1 font-medium text-rose-700">
                    (descuadre de {moneda.format(r.deltaTotal)})
                  </span>
                ) : (
                  <span className="ml-1 text-emerald-700">✓ cuadra</span>
                )}
              </>
            )}
          </p>

          {r.facturasAmbiguas > 0 && (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {r.facturasAmbiguas} gastos tienen más de una factura pre-registrada
              candidata con el mismo número. No se asignó ninguna: quedan en el triaje
              para que elijas cuál corresponde.
            </p>
          )}

          {r.oisDesconocidas.length > 0 && (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Órdenes internas que no están en la maestra:{" "}
              <span className="font-mono">{r.oisDesconocidas.join(", ")}</span>. Esos gastos
              quedaron sin proyecto asignado y esperan en el triaje.
            </p>
          )}
        </article>
      ))}
    </div>
  );
}

function Dato({
  etiqueta,
  valor,
  destacado = false,
}: {
  etiqueta: string;
  valor: number;
  destacado?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{etiqueta}</dt>
      <dd
        className={
          "mt-0.5 tabular-nums " +
          (destacado ? "text-lg font-semibold text-slate-900" : "text-slate-700")
        }
      >
        {valor}
      </dd>
    </div>
  );
}
