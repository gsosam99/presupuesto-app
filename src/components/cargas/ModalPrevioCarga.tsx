"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { fyEtiqueta } from "@/lib/fiscal";
import { moneda } from "@/lib/format";

/** Espejo de ArchivoPrevio en src/lib/ingesta/previsualizacion.ts. */
export interface ArchivoPrevio {
  nombreArchivo: string;
  hashArchivo: string;
  layout: "sap_ceco" | "sap_oi" | null;
  error: string | null;
  filasLeidas: number;
  filasSubtotal: number;
  descartadas: number;
  totalDeclarado: number | null;
  deltaTotal: number | null;
  cuadra: boolean;
  fechaMin: string | null;
  fechaMax: string | null;
  nuevas: number;
  exactas: number;
  probables: number;
  meses: Array<{
    mes: string;
    fy: number;
    nuevas: number;
    exactas: number;
    probables: number;
    monto: number;
  }>;
  yaCargadoEl: string | null;
}

export interface FiltroElegido {
  desde: string | null;
  hasta: string | null;
  omitirProbables: boolean;
}

interface Props {
  previas: ArchivoPrevio[];
  procesando: boolean;
  onCancelar: () => void;
  onConfirmar: (filtro: FiltroElegido) => void;
}

const NOMBRE_MES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function etiquetaMes(mes: string): string {
  const [a, m] = mes.split("-");
  return `${NOMBRE_MES[Number(m) - 1]} ${a}`;
}

/** Último día del mes "YYYY-MM", como ISO. */
function finDeMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${mes}-${String(new Date(a, m, 0).getDate()).padStart(2, "0")}`;
}

type Inclusion = "dentro" | "parcial" | "fuera";

function inclusionDelMes(mes: string, desde: string, hasta: string): Inclusion {
  const inicio = `${mes}-01`;
  const fin = finDeMes(mes);
  if (fin < desde || inicio > hasta) return "fuera";
  return inicio >= desde && fin <= hasta ? "dentro" : "parcial";
}

export function ModalPrevioCarga({ previas, procesando, onCancelar, onConfirmar }: Props) {
  const validos = previas.filter((p) => p.error === null);

  // Rango que cubren los archivos: es el default y también el tope del input.
  const [minArchivos, maxArchivos] = useMemo(() => {
    const fechas = validos.flatMap((p) =>
      p.fechaMin && p.fechaMax ? [p.fechaMin, p.fechaMax] : [],
    );
    fechas.sort();
    return [fechas[0] ?? "", fechas[fechas.length - 1] ?? ""];
  }, [validos]);

  const [desde, setDesde] = useState(minArchivos);
  const [hasta, setHasta] = useState(maxArchivos);

  const hayProbables = validos.some((p) => p.probables > 0);
  const [omitirProbables, setOmitirProbables] = useState(hayProbables);

  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (e.key === "Escape" && !procesando) onCancelar();
    }
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, [onCancelar, procesando]);

  // --- Consolidado por mes, sumando todos los archivos ----------------------
  const meses = useMemo(() => {
    const acc = new Map<
      string,
      { mes: string; fy: number; nuevas: number; exactas: number; probables: number; monto: number }
    >();
    for (const p of validos) {
      for (const m of p.meses) {
        const e =
          acc.get(m.mes) ??
          { mes: m.mes, fy: m.fy, nuevas: 0, exactas: 0, probables: 0, monto: 0 };
        e.nuevas += m.nuevas;
        e.exactas += m.exactas;
        e.probables += m.probables;
        e.monto += m.monto;
        acc.set(m.mes, e);
      }
    }
    return [...acc.values()].sort((a, b) => a.mes.localeCompare(b.mes));
  }, [validos]);

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

  const totalProbables = validos.reduce((s, p) => s + p.probables, 0);
  const totalExactas = validos.reduce((s, p) => s + p.exactas, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      onClick={() => {
        if (!procesando) onCancelar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-previo"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92svh] w-full max-w-3xl overflow-y-auto rounded-t-xl bg-white p-6 shadow-xl sm:rounded-xl"
      >
        <h2 id="titulo-previo" className="text-lg font-semibold text-slate-900">
          Revisar antes de cargar
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Nada se ha escrito todavía. Los exportables de SAP suelen arrastrar asientos de
          meses anteriores que recién ahora se aprobaron: revisa el detalle y acota el
          rango si hace falta.
        </p>

        {/* --- Archivos --- */}
        <section className="mt-5 space-y-2">
          {previas.map((p) => (
            <div
              key={p.nombreArchivo}
              className={
                "rounded-md border px-3 py-2 text-sm " +
                (p.error
                  ? "border-rose-200 bg-rose-50 text-rose-800"
                  : "border-slate-200 bg-slate-50 text-slate-700")
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
                  Descuadre de {moneda.format(p.deltaTotal)} contra el total que declara
                  SAP. Revisa el archivo antes de cargarlo.
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
        </section>

        {/* --- Meses --- */}
        {meses.length > 0 && (
          <section className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Qué traen los archivos
            </h3>
            <div className="mt-2 overflow-x-auto rounded-md border border-slate-200">
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
                  {meses.map((m) => {
                    const donde = inclusionDelMes(m.mes, desde, hasta);
                    return (
                      <tr
                        key={m.mes}
                        className={donde === "fuera" ? "text-slate-400" : "text-slate-700"}
                      >
                        <td className="px-3 py-2">
                          {etiquetaMes(m.mes)}
                          {donde === "parcial" && (
                            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                              parcial
                            </span>
                          )}
                          {donde === "fuera" && (
                            <span className="ml-2 text-[11px]">excluido</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">{fyEtiqueta(m.fy)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-900">
                          {donde === "fuera" ? "—" : m.nuevas}
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
                          {donde === "fuera" ? "—" : moneda.format(m.monto)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="mt-2 text-xs text-slate-500">
              <strong>Ya cargadas</strong>: idénticas a un gasto que ya existe, la base las
              ignora sola. <strong>Probables</strong>: misma fecha, misma factura y mismo
              monto que un gasto existente, pero con el proveedor o el texto escrito
              distinto — pasa entre el consolidado manual y SAP.
            </p>
          </section>
        )}

        {/* --- Acotamiento --- */}
        <section className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Acotar la carga
          </h3>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="block text-xs text-slate-600">Desde</span>
              <input
                type="date"
                value={desde}
                min={minArchivos}
                max={maxArchivos}
                onChange={(e) => setDesde(e.target.value)}
                className="mt-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
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
                className="mt-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
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
        </section>

        {rangoInvalido && (
          <p role="alert" className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            El rango está invertido: &quot;desde&quot; es posterior a &quot;hasta&quot;.
          </p>
        )}

        {/* --- Cierre --- */}
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
            {totalExactas > 0 && (
              <span className="block text-xs text-slate-500">
                {totalExactas} filas idénticas a gastos existentes se ignoran solas.
              </span>
            )}
          </p>

          <div className="flex gap-2">
            <Button
              type="button"
              variante="secundario"
              disabled={procesando}
              onClick={onCancelar}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={procesando || rangoInvalido || validos.length === 0}
              onClick={() =>
                onConfirmar({
                  desde: desde === "" ? null : desde,
                  hasta: hasta === "" ? null : hasta,
                  omitirProbables,
                })
              }
            >
              {procesando ? "Cargando…" : "Confirmar carga"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
