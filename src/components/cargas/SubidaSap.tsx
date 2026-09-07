"use client";

import { useCallback, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";

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
  totalDeclarado: number | null;
  deltaTotal: number | null;
  oisDesconocidas: string[];
}

interface Respuesta {
  resumenes: Resumen[];
  errores: Array<{ archivo: string; motivo: string }>;
  yaCargados: Array<{ archivo: string; cargadoEl: string }>;
  error?: string;
}

export function SubidaSap() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [arrastrando, setArrastrando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [respuesta, setRespuesta] = useState<Respuesta | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const subir = useCallback(
    async (archivos: FileList | File[], forzar = false) => {
      const lista = Array.from(archivos);
      if (lista.length === 0) return;

      setSubiendo(true);
      setErrorGeneral(null);

      try {
        const formData = new FormData();
        for (const a of lista) formData.append("archivos", a);
        if (forzar) formData.append("forzar", "true");

        const res = await fetch("/api/cargas/sap", { method: "POST", body: formData });
        const json = (await res.json()) as Respuesta;

        if (!res.ok) {
          setErrorGeneral(json.error ?? "No se pudo procesar la carga.");
          return;
        }

        setRespuesta(json);
        router.refresh();
      } catch {
        setErrorGeneral("No se pudo conectar con el servidor.");
      } finally {
        setSubiendo(false);
      }
    },
    [router],
  );

  const [ultimosArchivos, setUltimosArchivos] = useState<File[]>([]);

  const manejarArchivos = useCallback(
    (archivos: FileList | File[]) => {
      const lista = Array.from(archivos);
      setUltimosArchivos(lista);
      void subir(lista);
    },
    [subir],
  );

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastrando(false);
    if (!subiendo) manejarArchivos(e.dataTransfer.files);
  }

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
          disabled={subiendo}
          onClick={() => inputRef.current?.click()}
        >
          {subiendo ? "Procesando…" : "Elegir archivos"}
        </Button>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xls,.xlsx,.htm,.html"
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) manejarArchivos(e.target.files);
            e.target.value = "";
          }}
        />

        <p className="mt-3 text-xs text-slate-500">
          Puedes soltar los dos reportes (CeCo y OI) a la vez. Máximo 25 MB por archivo.
        </p>
      </div>

      {errorGeneral && (
        <p role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {errorGeneral}
        </p>
      )}

      {respuesta?.yaCargados.map((y) => (
        <div
          key={y.archivo}
          className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <p>
            <span className="font-medium">{y.archivo}</span> ya se cargó el{" "}
            {new Date(y.cargadoEl).toLocaleString("es-VE", { dateStyle: "short" })}. No se
            procesó de nuevo.
          </p>
          <Button
            type="button"
            variante="secundario"
            className="mt-2"
            disabled={subiendo}
            onClick={() => void subir(ultimosArchivos, true)}
          >
            Cargar igual
          </Button>
        </div>
      ))}

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

          <p className="mt-4 text-sm text-slate-600">
            Monto Real: <span className="font-medium text-slate-900">{moneda.format(r.montoReal)}</span>
            {r.totalDeclarado !== null && (
              <>
                {" · "}total declarado por SAP: {moneda.format(r.totalDeclarado)}
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

          <p className="mt-1 text-sm text-slate-600">
            Cruzaron contra una factura pre-registrada {r.conMatchFactura} de{" "}
            {r.filasLeidas - r.rechazadas} filas
            {r.conTagInferido > 0 && ` · ${r.conTagInferido} con Hunting Zone inferida por #TAG`}
            .
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
