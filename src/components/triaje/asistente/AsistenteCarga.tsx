"use client";

import { useCallback, useMemo, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";

import { PasosAsistente } from "@/components/triaje/asistente/PasosAsistente";
import { etiquetaMes, finDeMes, inclusionDelMes } from "@/components/triaje/asistente/meses";
import { Button } from "@/components/ui/Button";
import { fyEtiqueta } from "@/lib/fiscal";
import { moneda } from "@/lib/format";
import type { ArchivoPrevio } from "@/lib/ingesta/previsualizacion";

interface RespuestaCarga {
  idLote?: string | null;
  errores?: Array<{ archivo: string; motivo: string }>;
  error?: string;
}

const CONTROL_FECHA =
  "mt-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200";

/**
 * Pasos 1 y 2 del asistente de cruce. Nada se escribe hasta "Cargar y
 * cruzar": el paso 1 analiza los archivos contra lo ya cargado y el 2 acota
 * el rango. Al confirmar, el servidor vuelve a aplicar el filtro (no confía
 * en una lista de filas del navegador) y devuelve el lote para seguir.
 */
export function AsistenteCarga() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [paso, setPaso] = useState<1 | 2>(1);
  const [arrastrando, setArrastrando] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [previas, setPrevias] = useState<ArchivoPrevio[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errores, setErrores] = useState<Array<{ archivo: string; motivo: string }>>([]);

  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [omitirProbables, setOmitirProbables] = useState(false);

  const validos = useMemo(() => (previas ?? []).filter((p) => p.error === null), [previas]);

  // Rango que cubren los archivos: es el default y también el tope del input.
  const [minArchivos, maxArchivos] = useMemo(() => {
    const fechas = validos.flatMap((p) =>
      p.fechaMin && p.fechaMax ? [p.fechaMin, p.fechaMax] : [],
    );
    fechas.sort();
    return [fechas[0] ?? "", fechas[fechas.length - 1] ?? ""];
  }, [validos]);

  // Consolidado por mes, sumando todos los archivos.
  const meses = useMemo(() => {
    const acc = new Map<
      string,
      { mes: string; fy: number; nuevas: number; exactas: number; probables: number; monto: number }
    >();
    for (const p of validos) {
      for (const m of p.meses) {
        const e = acc.get(m.mes) ?? {
          mes: m.mes,
          fy: m.fy,
          nuevas: 0,
          exactas: 0,
          probables: 0,
          monto: 0,
        };
        e.nuevas += m.nuevas;
        e.exactas += m.exactas;
        e.probables += m.probables;
        e.monto += m.monto;
        acc.set(m.mes, e);
      }
    }
    return [...acc.values()].sort((a, b) => a.mes.localeCompare(b.mes));
  }, [validos]);

  const totalProbables = validos.reduce((s, p) => s + p.probables, 0);
  const totalExactas = validos.reduce((s, p) => s + p.exactas, 0);
  const totalNuevas = validos.reduce((s, p) => s + p.nuevas, 0);
  const montoNuevo = meses.reduce((s, m) => s + m.monto, 0);
  const rangoInvalido = desde !== "" && hasta !== "" && desde > hasta;

  // Sólo se suman los meses enteramente dentro del rango: un mes partido no se
  // puede contar con datos agregados por mes sin mentir.
  const resumen = useMemo(() => {
    let filas = 0;
    let monto = 0;
    let parciales = 0;
    for (const m of meses) {
      const donde = inclusionDelMes(m.mes, desde, hasta);
      if (donde === "fuera") continue;
      if (donde === "parcial") {
        parciales += 1;
        continue;
      }
      filas += m.nuevas + (omitirProbables ? 0 : m.probables);
      monto += m.monto;
    }
    return { filas, monto, parciales };
  }, [meses, desde, hasta, omitirProbables]);

  const analizar = useCallback(async (lista: File[]) => {
    if (lista.length === 0) return;
    setAnalizando(true);
    setError(null);
    setErrores([]);

    try {
      const formData = new FormData();
      for (const a of lista) formData.append("archivos", a);
      const res = await fetch("/api/cargas/sap/previsualizar", { method: "POST", body: formData });
      const json = (await res.json()) as { previas?: ArchivoPrevio[]; error?: string };

      if (!res.ok || !json.previas) {
        setError(json.error ?? "No se pudo analizar la carga.");
        return;
      }

      const ok = json.previas.filter((p) => p.error === null);
      const fechas = ok.flatMap((p) => (p.fechaMin && p.fechaMax ? [p.fechaMin, p.fechaMax] : []));
      fechas.sort();

      setArchivos(lista);
      setPrevias(json.previas);
      setDesde(fechas[0] ?? "");
      setHasta(fechas[fechas.length - 1] ?? "");
      setOmitirProbables(ok.some((p) => p.probables > 0));
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setAnalizando(false);
    }
  }, []);

  async function cargar() {
    setCargando(true);
    setError(null);
    setErrores([]);

    try {
      const formData = new FormData();
      for (const a of archivos) formData.append("archivos", a);
      if (desde) formData.append("desde", desde);
      if (hasta) formData.append("hasta", hasta);
      if (omitirProbables) formData.append("omitirProbables", "true");
      // El paso 1 ya mostró si el archivo se había procesado antes.
      formData.append("forzar", "true");

      const res = await fetch("/api/cargas/sap", { method: "POST", body: formData });
      const json = (await res.json()) as RespuestaCarga;

      if (!res.ok) {
        setError(json.error ?? "No se pudo procesar la carga.");
        return;
      }
      if (!json.idLote) {
        setErrores(json.errores ?? []);
        setError("Ningún archivo se pudo cargar.");
        return;
      }

      router.push(`/triaje/lote/${json.idLote}?paso=3`);
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setCargando(false);
    }
  }

  function reiniciar() {
    setPaso(1);
    setPrevias(null);
    setArchivos([]);
    setError(null);
    setErrores([]);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastrando(false);
    if (!analizando) void analizar(Array.from(e.dataTransfer.files));
  }

  return (
    <div>
      <PasosAsistente actual={paso} />

      {/* ---------------- Paso 1: qué se va a cargar ---------------- */}
      {paso === 1 && (
        <section className="mt-6">
          {previas === null ? (
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
                Arrastra acá los <span className="font-medium text-slate-900">.xls</span> de SAP, o
              </p>
              <Button
                type="button"
                variante="secundario"
                className="mt-3"
                disabled={analizando}
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
                  if (e.target.files) void analizar(Array.from(e.target.files));
                  e.target.value = "";
                }}
              />
              <p className="mt-3 text-xs text-slate-500">
                Puedes soltar los dos reportes (CeCo y OI) a la vez. Máximo 25 MB por archivo. Nada
                se escribe hasta el paso 2.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {previas.map((p) => (
                  <div
                    key={p.nombreArchivo}
                    className={
                      "rounded-md border px-3 py-2 text-sm " +
                      (p.error
                        ? "border-rose-200 bg-rose-50 text-rose-800"
                        : "border-slate-200 bg-white text-slate-700")
                    }
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="font-medium text-slate-900">{p.nombreArchivo}</span>
                      {p.layout && (
                        <span className="text-xs text-slate-500">
                          {p.layout === "sap_ceco" ? "Centro de Costo" : "Orden Interna"} ·{" "}
                          {p.filasLeidas - p.descartadas} filas
                          {p.fechaMin && p.fechaMax && ` · ${p.fechaMin} a ${p.fechaMax}`}
                        </span>
                      )}
                    </div>
                    {p.error && <p className="mt-1">{p.error}</p>}
                    {!p.error && !p.cuadra && p.deltaTotal !== null && (
                      <p className="mt-1 font-medium text-rose-700">
                        Descuadre de {moneda.format(p.deltaTotal)} contra el total que declara SAP.
                        Revisa el archivo antes de cargarlo.
                      </p>
                    )}
                    {p.yaCargadoEl && (
                      <p className="mt-1 text-amber-800">
                        Este archivo ya se procesó el{" "}
                        {new Date(p.yaCargadoEl).toLocaleString("es-VE", { dateStyle: "short" })}.
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="ui-kpi">
                  <dt className="kl">Filas nuevas</dt>
                  <dd className="kv">{totalNuevas}</dd>
                </div>
                <div className="ui-kpi">
                  <dt className="kl">Monto nuevo</dt>
                  <dd className="kv">{moneda.format(montoNuevo)}</dd>
                </div>
                <div className="ui-kpi">
                  <dt className="kl">Ya cargadas</dt>
                  <dd className="kv">{totalExactas}</dd>
                </div>
                <div className="ui-kpi">
                  <dt className="kl">Probables repetidos</dt>
                  <dd className="kv">{totalProbables}</dd>
                </div>
              </dl>

              {meses.length > 0 && (
                <div className="mt-5 overflow-x-auto rounded-md border border-slate-200 bg-white">
                  <table className="w-full min-w-[34rem] text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2 font-medium">Mes</th>
                        <th className="px-3 py-2 font-medium">FY</th>
                        <th className="px-3 py-2 text-right font-medium">Nuevas</th>
                        <th className="px-3 py-2 text-right font-medium">Ya cargadas</th>
                        <th className="px-3 py-2 text-right font-medium">Probables</th>
                        <th className="px-3 py-2 text-right font-medium">Monto nuevo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {meses.map((m) => (
                        <tr key={m.mes} className="text-slate-700">
                          <td className="px-3 py-2">{etiquetaMes(m.mes)}</td>
                          <td className="px-3 py-2 text-xs">{fyEtiqueta(m.fy)}</td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums text-slate-900">
                            {m.nuevas}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{m.exactas}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {m.probables > 0 ? (
                              <span className="font-medium text-amber-700">{m.probables}</span>
                            ) : (
                              0
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {moneda.format(m.monto)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="mt-2 text-xs text-slate-500">
                <strong>Ya cargadas</strong>: idénticas a un gasto que ya existe, la base las ignora
                sola. <strong>Probables</strong>: misma fecha, factura y monto que un gasto
                existente, pero con el proveedor o el texto escrito distinto.
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                <Button type="button" variante="secundario" onClick={reiniciar}>
                  Elegir otros archivos
                </Button>
                <Button type="button" disabled={validos.length === 0} onClick={() => setPaso(2)}>
                  Siguiente: rango de fechas
                </Button>
              </div>
            </>
          )}
        </section>
      )}

      {/* ---------------- Paso 2: rango de fechas ---------------- */}
      {paso === 2 && (
        <section className="mt-6">
          <p className="max-w-3xl text-sm text-slate-600">
            Los exportables de SAP suelen arrastrar asientos de meses anteriores que recién ahora se
            aprobaron. Acota el rango a lo que corresponde cargar.
          </p>

          <div className="mt-4 rounded-md border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="block text-xs text-slate-600">Desde</span>
                <input
                  type="date"
                  value={desde}
                  min={minArchivos}
                  max={maxArchivos}
                  onChange={(e) => setDesde(e.target.value)}
                  className={CONTROL_FECHA}
                />
              </label>
              <label className="text-sm">
                <span className="block text-xs text-slate-600">Hasta</span>
                <input
                  type="date"
                  value={hasta}
                  min={minArchivos}
                  max={maxArchivos}
                  onChange={(e) => setHasta(e.target.value)}
                  className={CONTROL_FECHA}
                />
              </label>
              <Button
                type="button"
                variante="secundario"
                className="px-2 py-1 text-xs"
                onClick={() => {
                  setDesde(minArchivos);
                  setHasta(maxArchivos);
                }}
              >
                Todo el archivo
              </Button>
            </div>

            {meses.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {meses.map((m) => (
                  <button
                    key={m.mes}
                    type="button"
                    onClick={() => {
                      setDesde(`${m.mes}-01`);
                      setHasta(finDeMes(m.mes));
                    }}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    sólo {etiquetaMes(m.mes)}
                  </button>
                ))}
              </div>
            )}

            {totalProbables > 0 && (
              <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={omitirProbables}
                  onChange={(e) => setOmitirProbables(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Omitir las <strong>{totalProbables}</strong> filas marcadas como probables
                  repetidos.
                </span>
              </label>
            )}

            <ul className="mt-4 divide-y divide-slate-100 text-sm">
              {meses.map((m) => {
                const donde = inclusionDelMes(m.mes, desde, hasta);
                return (
                  <li
                    key={m.mes}
                    className={
                      "flex justify-between py-1.5 " +
                      (donde === "fuera" ? "text-slate-400" : "text-slate-700")
                    }
                  >
                    <span>
                      {etiquetaMes(m.mes)}
                      {donde === "parcial" && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                          parcial
                        </span>
                      )}
                      {donde === "fuera" && <span className="ml-2 text-[11px]">excluido</span>}
                    </span>
                    <span className="tabular-nums">
                      {donde === "fuera" ? "—" : `${m.nuevas} · ${moneda.format(m.monto)}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {rangoInvalido && (
            <p role="alert" className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
              El rango está invertido: &quot;desde&quot; es posterior a &quot;hasta&quot;.
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <p className="text-sm text-slate-700">
              Se insertarán{" "}
              <span className="font-semibold text-slate-900">{resumen.filas} filas</span>
              {resumen.monto > 0 && ` · ${moneda.format(resumen.monto)}`}
              {resumen.parciales > 0 && (
                <span className="text-slate-500">
                  {" "}
                  (+ lo que caiga dentro del rango en {resumen.parciales}{" "}
                  {resumen.parciales === 1 ? "mes parcial" : "meses parciales"})
                </span>
              )}
              <span className="block text-xs text-slate-500">
                Al cargar, cada gasto se cruza con las facturas pre-registradas por número de
                factura.
              </span>
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variante="secundario"
                disabled={cargando}
                onClick={() => setPaso(1)}
              >
                Atrás
              </Button>
              <Button
                type="button"
                disabled={cargando || rangoInvalido || validos.length === 0}
                onClick={() => void cargar()}
              >
                {cargando ? "Cargando y cruzando…" : "Cargar y cruzar"}
              </Button>
            </div>
          </div>
        </section>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      {errores.map((e) => (
        <p key={e.archivo} className="mt-2 rounded-md bg-rose-50 px-4 py-2 text-sm text-rose-700">
          <span className="font-medium">{e.archivo}</span>: {e.motivo}
        </p>
      ))}
    </div>
  );
}
