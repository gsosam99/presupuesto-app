"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";

import {
  PasosAsistente,
  PASOS,
  type NumeroPaso,
} from "@/components/triaje/asistente/PasosAsistente";
import { avisarNavegacion } from "@/components/nav/BarraNavegacion";
import { etiquetaMes, finDeMes, inclusionDelMes } from "@/components/triaje/asistente/meses";
import { PlanCruceAutomatico } from "@/components/triaje/asistente/plan/PlanCruceAutomatico";
import { PlanMatchManual } from "@/components/triaje/asistente/plan/PlanMatchManual";
import { PlanRezagadas } from "@/components/triaje/asistente/plan/PlanRezagadas";
import { PlanResumen } from "@/components/triaje/asistente/plan/PlanResumen";
import {
  agruparAutomaticos,
  type AjusteGasto,
  type Ajustes,
  type GrupoAutomatico,
} from "@/components/triaje/asistente/plan/tipos";
import type { OpcionAsignacion, Sugerencias } from "@/components/triaje/TablaTriaje";
import { useAvisos } from "@/components/ui/Avisos";
import { Button } from "@/components/ui/Button";
import { ModalConfirmacion } from "@/components/ui/ModalConfirmacion";
import { fyEtiqueta } from "@/lib/fiscal";
import { moneda } from "@/lib/format";
import type { PlanCarga } from "@/lib/ingesta/planCarga";
import type { ArchivoPrevio } from "@/lib/ingesta/previsualizacion";
import type { FacturaSinCruzar } from "@/lib/triaje/lote";

type ErrorArchivo = { archivo: string; motivo: string };

interface RespuestaPlan {
  plan?: PlanCarga;
  errores?: ErrorArchivo[];
  error?: string;
}

interface RespuestaCarga {
  idLote?: string | null;
  errores?: ErrorArchivo[];
  error?: string;
}

interface Props {
  /** Facturas pre-registradas sin cruzar, para el match manual (paso 4). */
  facturas: FacturaSinCruzar[];
  /** Catálogos de la grilla de rezagadas (paso 5). */
  asignaciones: OpcionAsignacion[];
  sugerencias: Sugerencias;
  encargados: Array<{ id: string; etiqueta: string }>;
}

/** Combina una decisión nueva con la previa de la fila. */
function combinar(previo: AjusteGasto | undefined, nuevo: AjusteGasto): AjusteGasto {
  return { ...previo, ...nuevo };
}

const CONTROL_FECHA =
  "mt-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200";

/**
 * Asistente de carga de SAP, de punta a punta. NADA se escribe hasta
 * "Confirmar y registrar" en el resumen (paso 6):
 *
 *   1-2  analizan los archivos contra lo ya cargado y acotan el rango.
 *   3-5  trabajan sobre un plan en memoria que calcula el servidor
 *        (modo=plan): deshacer cruces, asociar facturas, completar rezagadas.
 *        Cada decisión se guarda como criterio (`ajustes`) y el plan se
 *        recalcula al cambiar de paso.
 *   6    muestra el plan final; al confirmar, el servidor lo vuelve a calcular
 *        con las mismas decisiones y recién ahí escribe.
 */
export function AsistenteCarga({ facturas, asignaciones, sugerencias, encargados }: Props) {
  const router = useRouter();
  const avisos = useAvisos();
  const inputRef = useRef<HTMLInputElement>(null);

  const [paso, setPaso] = useState<NumeroPaso>(1);
  const [alcanzado, setAlcanzado] = useState<NumeroPaso>(1);
  const [plan, setPlan] = useState<PlanCarga | null>(null);
  const [gruposAuto, setGruposAuto] = useState<GrupoAutomatico[]>([]);
  const [ajustes, setAjustes] = useState<Ajustes>({});
  const [calculando, setCalculando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  /** Rango con el que se armó el plan: si cambia, las decisiones ya no aplican. */
  const [filtroDelPlan, setFiltroDelPlan] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [previas, setPrevias] = useState<ArchivoPrevio[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errores, setErrores] = useState<ErrorArchivo[]>([]);

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

  /** Archivos + rango elegidos, en el FormData que esperan las dos llamadas. */
  function datosCarga(modo: "plan" | "confirmar", decisiones: Ajustes): FormData {
    const formData = new FormData();
    for (const a of archivos) formData.append("archivos", a);
    if (desde) formData.append("desde", desde);
    if (hasta) formData.append("hasta", hasta);
    if (omitirProbables) formData.append("omitirProbables", "true");
    // El paso 1 ya mostró si el archivo se había procesado antes.
    formData.append("forzar", "true");
    formData.append("modo", modo);
    formData.append("ajustes", JSON.stringify(decisiones));
    return formData;
  }

  /** Pide al servidor el plan con las decisiones dadas. No escribe nada. */
  async function planificar(decisiones: Ajustes): Promise<PlanCarga | null> {
    setCalculando(true);
    setError(null);
    setErrores([]);
    try {
      const res = await fetch("/api/cargas/sap", {
        method: "POST",
        body: datosCarga("plan", decisiones),
      });
      const json = (await res.json()) as RespuestaPlan;
      if (!res.ok || !json.plan) {
        setError(json.error ?? "No se pudo analizar la carga.");
        return null;
      }
      setErrores(json.errores ?? []);
      setPlan(json.plan);
      return json.plan;
    } catch {
      setError("No se pudo conectar con el servidor.");
      return null;
    } finally {
      setCalculando(false);
    }
  }

  /**
   * Paso 2 → 3. Con el mismo rango que el plan vigente se sigue donde se
   * estaba; con otro rango se arma un plan nuevo, sin decisiones.
   */
  async function empezarCruce() {
    const filtro = `${desde}|${hasta}|${omitirProbables}`;
    if (plan !== null && filtro === filtroDelPlan) {
      await irA(3);
      return;
    }
    const nuevo = await planificar({});
    if (!nuevo) return;
    setFiltroDelPlan(filtro);
    setAjustes({});
    setGruposAuto(agruparAutomaticos(nuevo.filas, nuevo.nombres));
    setPaso(3);
    setAlcanzado(3);
  }

  /** Cambia de paso recalculando el plan con las decisiones tomadas. */
  async function irA(n: NumeroPaso) {
    if (n <= 2) {
      setPaso(n);
      return;
    }
    // Se cambió el rango en el paso 2: el plan (y sus decisiones) se rehace.
    if (`${desde}|${hasta}|${omitirProbables}` !== filtroDelPlan) {
      await empezarCruce();
      return;
    }
    const nuevo = await planificar(ajustes);
    if (!nuevo) return;
    setPaso(n);
    setAlcanzado((a) => (n > a ? n : a));
  }

  /**
   * Guarda una decisión y la refleja en el plan al instante (para que la
   * fila salga de la lista). El servidor la valida al recalcular: si no se
   * pudo aplicar, la fila vuelve a pendiente con un aviso.
   */
  const ajustar = useCallback((claves: string[], ajuste: AjusteGasto) => {
    const afectadas = new Set(claves);
    setAjustes((prev) => {
      const sig = { ...prev };
      for (const c of claves) sig[c] = combinar(prev[c], ajuste);
      return sig;
    });
    setPlan((p) =>
      p === null
        ? p
        : {
            ...p,
            filas: p.filas.map((f) => {
              if (!afectadas.has(f.clave)) return f;
              const g = { ...f, ajustada: true, aviso: null };
              if (ajuste.id_factura_preregistrada === null) {
                g.id_factura_preregistrada = null;
                g.metodo_cruce = null;
              } else if (ajuste.id_factura_preregistrada) {
                g.id_factura_preregistrada = ajuste.id_factura_preregistrada;
                g.metodo_cruce = "manual";
              }
              if (ajuste.estado) g.estado_revision = ajuste.estado;
              return g;
            }),
          },
    );
  }, []);

  /** Deshace una decisión. Se recalcula de inmediato: no hay cómo adivinar el estado previo. */
  async function revertir(claves: string[], campos: Array<keyof AjusteGasto>) {
    const sig: Ajustes = { ...ajustes };
    for (const c of claves) {
      const a = { ...sig[c] };
      for (const campo of campos) delete a[campo];
      if (Object.keys(a).length === 0) delete sig[c];
      else sig[c] = a;
    }
    setAjustes(sig);
    await planificar(sig);
  }

  async function confirmar() {
    setConfirmando(true);
    setError(null);
    setErrores([]);
    try {
      const res = await fetch("/api/cargas/sap", {
        method: "POST",
        body: datosCarga("confirmar", ajustes),
      });
      const json = (await res.json()) as RespuestaCarga;

      if (!res.ok) {
        setError(json.error ?? "No se pudo registrar la carga.");
        return;
      }
      if (!json.idLote) {
        setErrores(json.errores ?? []);
        setError("Ningún archivo se pudo registrar.");
        return;
      }

      avisos.exito("Carga registrada.");
      setPlan(null);
      avisarNavegacion();
      router.push(`/triaje/lote/${json.idLote}?paso=6`);
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setConfirmando(false);
    }
  }

  // Hay decisiones sin registrar: avisar antes de cerrar o recargar la pestaña.
  const hayPlanSinConfirmar = plan !== null && paso >= 3;
  useEffect(() => {
    if (!hayPlanSinConfirmar) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hayPlanSinConfirmar]);

  function reiniciar() {
    setPaso(1);
    setAlcanzado(1);
    setPlan(null);
    setAjustes({});
    setGruposAuto([]);
    setFiltroDelPlan(null);
    setCancelando(false);
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
      <PasosAsistente
        actual={paso}
        alcanzado={alcanzado}
        onIr={(n) => void irA(n)}
        deshabilitado={calculando || confirmando}
        contadores={
          plan
            ? {
                4: plan.filas.filter(
                  (f) => f.estado_revision === "pendiente" && f.id_factura_preregistrada === null,
                ).length,
                5: plan.filas.filter((f) => f.estado_revision === "pendiente").length,
              }
            : undefined
        }
      />

      {cancelando && (
        <ModalConfirmacion
          titulo="Cancelar esta carga"
          textoConfirmar="Cancelar carga"
          peligro
          onConfirmar={reiniciar}
          onCancelar={() => setCancelando(false)}
        >
          <p>
            Todavía no se registró nada. Se descartan los archivos y las decisiones que tomaste en
            el asistente.
          </p>
        </ModalConfirmacion>
      )}

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
                cargando={analizando}
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
                  <dd className="mt-1 text-[11px] text-[var(--muted)]">
                    Idénticas a un gasto que ya está en la app. Se ignoran solas.
                  </dd>
                </div>
                <div className="ui-kpi">
                  <dt className="kl">Posibles repetidos</dt>
                  <dd
                    className="kv"
                    style={{ color: totalProbables > 0 ? "var(--warn)" : undefined }}
                  >
                    {totalProbables}
                  </dd>
                  <dd className="mt-1 text-[11px] text-[var(--muted)]">
                    Parecen un gasto ya cargado pero no son idénticos. Tú decides en el paso 2.
                  </dd>
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
                        <th className="px-3 py-2 text-right font-medium">Posibles repetidos</th>
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

              <div className="mt-3 rounded-md border border-[var(--line)] bg-white px-4 py-3 text-xs text-[var(--ink-soft)]">
                <p>
                  <strong className="text-[var(--ink)]">Ya cargadas</strong>: la fila es idéntica
                  (proveedor, factura, texto, fecha y monto) a un gasto que ya está en la app, por
                  ejemplo porque este mismo reporte ya se subió. No se vuelven a registrar y no hay
                  nada que decidir.
                </p>
                <p className="mt-1.5">
                  <strong className="text-[var(--ink)]">Posibles repetidos</strong>: coinciden
                  fecha, número de factura y monto con un gasto existente, pero el proveedor o el
                  texto vienen escritos distinto (pasa entre el consolidado manual y SAP). Puede ser
                  el mismo gasto o uno distinto: en el paso 2 eliges si se omiten.
                </p>
              </div>

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
                  Omitir los <strong>{totalProbables}</strong> posibles repetidos (recomendado si ya
                  cargaste estos meses desde el consolidado manual).
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
              Entrarían <span className="font-semibold text-slate-900">{resumen.filas} filas</span>
              {resumen.monto > 0 && ` · ${moneda.format(resumen.monto)}`}
              {resumen.parciales > 0 && (
                <span className="text-slate-500">
                  {" "}
                  (+ lo que caiga dentro del rango en {resumen.parciales}{" "}
                  {resumen.parciales === 1 ? "mes parcial" : "meses parciales"})
                </span>
              )}
              <span className="block text-xs text-slate-500">
                Todavía no se registra nada: en los pasos siguientes revisas los cruces con las
                facturas y, al final, confirmas en el resumen.
              </span>
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variante="secundario"
                disabled={calculando}
                onClick={() => setPaso(1)}
              >
                Atrás
              </Button>
              <Button
                cargando={calculando}
                type="button"
                disabled={calculando || rangoInvalido || validos.length === 0}
                onClick={() => void empezarCruce()}
              >
                {calculando ? "Cruzando con las facturas…" : "Siguiente: cruce automático"}
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* ---------------- Pasos 3 a 6: plan en memoria ---------------- */}
      {paso >= 3 && plan && (
        <section className="relative mt-6" aria-busy={calculando}>
          <h2 className="ui-section-title">
            Paso {paso} · {PASOS[paso - 1]}
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Nada se registra hasta que confirmes en el resumen.
          </p>

          <div className={`mt-4 transition-opacity ${calculando ? "opacity-50" : ""}`}>
            {paso === 3 && (
              <PlanCruceAutomatico
                grupos={gruposAuto}
                ajustes={ajustes}
                onAjustar={ajustar}
                onRevertir={(c, campos) => void revertir(c, campos)}
              />
            )}
            {paso === 4 && (
              <PlanMatchManual
                filas={plan.filas}
                facturas={facturas}
                ajustes={ajustes}
                onAjustar={ajustar}
                onRevertir={(c, campos) => void revertir(c, campos)}
              />
            )}
            {paso === 5 && (
              <PlanRezagadas
                filas={plan.filas}
                nombres={plan.nombres}
                asignaciones={asignaciones}
                sugerencias={sugerencias}
                encargados={encargados}
                onAjustar={ajustar}
              />
            )}
            {paso === 6 && (
              <PlanResumen archivos={plan.archivos} filas={plan.filas} nombres={plan.nombres} />
            )}
          </div>

          <nav
            aria-label="Navegación del asistente"
            className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4"
          >
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variante="secundario"
                disabled={calculando || confirmando}
                onClick={() => void irA((paso - 1) as NumeroPaso)}
              >
                ← {PASOS[paso - 2]}
              </Button>
              <Button
                type="button"
                variante="secundario"
                disabled={calculando || confirmando}
                onClick={() => setCancelando(true)}
                className="text-[var(--bad)]"
              >
                Cancelar carga
              </Button>
            </div>
            {paso < 6 ? (
              <Button
                cargando={calculando}
                type="button"
                onClick={() => void irA((paso + 1) as NumeroPaso)}
              >
                {calculando ? "Calculando…" : `${(PASOS as readonly string[])[paso]} →`}
              </Button>
            ) : (
              <Button
                cargando={confirmando}
                type="button"
                disabled={calculando || plan.filas.length === 0}
                onClick={() => void confirmar()}
              >
                {confirmando
                  ? "Registrando…"
                  : plan.filas.length === 0
                    ? "No hay gastos nuevos que registrar"
                    : `Confirmar y registrar ${plan.filas.length} gastos`}
              </Button>
            )}
          </nav>
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
