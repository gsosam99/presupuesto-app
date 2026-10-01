"use client";

import { Fragment, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useCargaArchivo } from "@/hooks/useCargaArchivo";
import { moneda } from "@/lib/format";
import type { PreviaPresupuesto, ResumenCargaPresupuesto } from "@/lib/ingesta/presupuestos";

type Previa = PreviaPresupuesto & { yaCargadoEl: string | null };

/**
 * Carga del Plan / Extra Plan en dos pasos: elegir el archivo muestra una
 * vista previa (totales por orden y CeCo, por año fiscal, rechazos) sin
 * escribir nada; recién "Confirmar carga" lo registra.
 */
export function SubidaPresupuesto() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [tipo, setTipo] = useState<"plan" | "extra_plan">("plan");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [errorPrevia, setErrorPrevia] = useState<string | null>(null);
  /** Orden/CeCo desplegado en la vista previa, para auditar sus líneas. */
  const [abierta, setAbierta] = useState<string | null>(null);
  const { subiendo, resumen, error, subir } =
    useCargaArchivo<ResumenCargaPresupuesto>("/api/presupuestos");

  async function analizar(elegido: File) {
    setArchivo(elegido);
    setPrevia(null);
    setErrorPrevia(null);
    setAbierta(null);
    setAnalizando(true);
    try {
      const formData = new FormData();
      formData.append("archivo", elegido);
      formData.append("tipo", tipo);
      formData.append("modo", "previsualizar");
      const res = await fetch("/api/presupuestos", { method: "POST", body: formData });
      const json = (await res.json()) as { previa?: Previa; error?: string };
      if (!res.ok || !json.previa) {
        setErrorPrevia(json.error ?? "No se pudo analizar el archivo.");
        return;
      }
      setPrevia(json.previa);
    } catch {
      setErrorPrevia("No se pudo conectar con el servidor.");
    } finally {
      setAnalizando(false);
    }
  }

  async function confirmar() {
    if (!archivo || !previa) return;
    // La vista previa ya avisó si el archivo se había cargado: confirmar es decidir.
    await subir(archivo, { forzar: previa.yaCargadoEl !== null, camposExtra: { tipo } });
    setPrevia(null);
    setArchivo(null);
  }

  function descartar() {
    setPrevia(null);
    setArchivo(null);
    setErrorPrevia(null);
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <fieldset disabled={previa !== null || analizando || subiendo}>
        <legend className="text-sm font-medium text-slate-700">¿Qué estás cargando?</legend>
        <p className="mt-1 text-xs text-slate-500">
          Los formatos no traen una columna que los distinga, así que hay que indicarlo acá.
        </p>

        <div className="mt-3 flex flex-wrap gap-4">
          {(
            [
              ["plan", "Plan base"],
              ["extra_plan", "Extra plan"],
            ] as const
          ).map(([valor, etiqueta]) => (
            <label key={valor} className="flex items-center gap-2 text-sm text-slate-900">
              <input
                type="radio"
                name="tipo-presupuesto"
                value={valor}
                checked={tipo === valor}
                onChange={() => setTipo(valor)}
                className="h-4 w-4 border-slate-300 text-slate-900 focus:ring-slate-300"
              />
              {etiqueta}
            </label>
          ))}
        </div>
      </fieldset>

      {previa === null && (
        <div className="mt-4">
          <Button
            cargando={analizando}
            type="button"
            disabled={analizando || subiendo}
            onClick={() => inputRef.current?.click()}
          >
            {analizando ? "Analizando…" : "Elegir Excel de presupuesto"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xlsm"
            className="sr-only"
            onChange={(e) => {
              const elegido = e.target.files?.[0];
              if (elegido) void analizar(elegido);
              e.target.value = "";
            }}
          />
          <p className="mt-2 text-xs text-slate-500">
            Primero verás qué se va a cargar. Nada se registra hasta que confirmes.
          </p>
        </div>
      )}

      {(errorPrevia ?? error) && (
        <p role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {errorPrevia ?? error}
        </p>
      )}

      {previa && (
        <section className="mt-4 space-y-4" aria-label="Vista previa de la carga">
          <div>
            <p className="text-sm text-slate-900">
              <span className="font-medium">{previa.nombreArchivo}</span> ·{" "}
              {tipo === "plan" ? "Plan base" : "Extra Plan"}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Se cargarían <strong className="text-slate-900">{previa.lineas} líneas</strong> por{" "}
              <strong className="text-slate-900">{moneda.format(previa.montoTotal)}</strong>
              {previa.omitidasEnCero > 0 && ` · ${previa.omitidasEnCero} líneas en 0 omitidas`}
              {previa.macroactividades > 0 &&
                ` · ${previa.macroactividades} macroactividades distintas`}
            </p>
          </div>

          {previa.yaCargadoEl && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Este mismo archivo ya se cargó el{" "}
              {new Date(previa.yaCargadoEl).toLocaleString("es-VE", { dateStyle: "short" })}.
              Confirmar duplicaría sus líneas presupuestarias.
            </p>
          )}

          {previa.porFy.length > 0 && (
            <table className="text-sm">
              <tbody>
                {previa.porFy.map((f) => (
                  <tr key={f.fy}>
                    <td className="pr-4 text-slate-500">FY {f.etiqueta}</td>
                    <td className="pr-4 tabular-nums text-slate-600">{f.filas} líneas</td>
                    <td className="tabular-nums text-slate-900">{moneda.format(f.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {previa.porUnidad.length > 0 && (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <p className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                Toca una orden para ver sus líneas una por una. &quot;Fila&quot; es la del Excel.
              </p>
              <table className="ui-table min-w-[40rem] text-xs">
                <thead>
                  <tr>
                    <th>Orden / CeCo</th>
                    <th>Nombre</th>
                    <th className="r">Líneas</th>
                    <th className="r">Con macroactividad</th>
                    <th className="r">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.porUnidad.map((u) => {
                    const clave = `${u.tipo}:${u.unidad}`;
                    const desplegada = abierta === clave;
                    return (
                      <Fragment key={clave}>
                        <tr className={desplegada ? "bg-[var(--line-soft)]" : undefined}>
                          <td className="font-mono text-[var(--ink)]">
                            <button
                              type="button"
                              aria-expanded={desplegada}
                              onClick={() => setAbierta(desplegada ? null : clave)}
                              className="inline-flex items-center gap-1 font-semibold text-[var(--blue)] hover:underline"
                              title="Ver las líneas de esta orden"
                            >
                              <ChevronRight
                                className={`size-3.5 transition-transform ${desplegada ? "rotate-90" : ""}`}
                                aria-hidden
                              />
                              {u.tipo === "ceco" ? `CeCo ${u.unidad}` : u.unidad}
                            </button>
                          </td>
                          <td>{u.nombre ?? "—"}</td>
                          <td className="r">{u.lineas}</td>
                          <td className="r">
                            {u.conMacroactividad === u.lineas ? (
                              "todas"
                            ) : (
                              <span className="font-semibold text-amber-700">
                                {u.conMacroactividad} de {u.lineas}
                              </span>
                            )}
                          </td>
                          <td className="r font-semibold text-[var(--ink)]">
                            {moneda.format(u.monto)}
                          </td>
                        </tr>
                        {desplegada && (
                          <tr>
                            <td colSpan={5} className="bg-white p-0">
                              <div className="max-h-80 overflow-auto border-y border-[var(--line)]">
                                <table className="ui-table text-[11px]">
                                  <thead className="sticky top-0 bg-white">
                                    <tr>
                                      <th>Fila</th>
                                      <th>Mes</th>
                                      <th>Cuenta</th>
                                      <th>Detalle</th>
                                      <th>Macroactividad</th>
                                      <th>Responsable</th>
                                      <th className="r">Monto</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {u.lineasDetalle.map((l) => (
                                      <tr key={l.fila}>
                                        <td className="text-[var(--muted)]">{l.fila}</td>
                                        <td>{l.periodo}</td>
                                        <td className="font-mono">{l.cuenta ?? "—"}</td>
                                        <td className="whitespace-normal">{l.detalle ?? "—"}</td>
                                        <td className="whitespace-normal">
                                          {l.macroactividad ?? (
                                            <span className="font-semibold text-amber-700">
                                              sin macroactividad
                                            </span>
                                          )}
                                        </td>
                                        <td>{l.responsable ?? "—"}</td>
                                        <td className="r">{moneda.format(l.monto)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {(previa.oisDesconocidas.length > 0 || previa.cecosDesconocidos.length > 0) && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              No están en las maestras y sus líneas no se cargarían:{" "}
              <span className="font-mono">
                {[...previa.oisDesconocidas, ...previa.cecosDesconocidos].join(", ")}
              </span>
              . Agrégalas en Configuración y vuelve a elegir el archivo.
            </p>
          )}

          {previa.rechazos.length > 0 && (
            <ul className="space-y-1 text-xs text-amber-800">
              {previa.rechazos.map((r) => (
                <li key={`${r.fila}-${r.motivo}`}>
                  Fila {r.fila}: {r.motivo}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
            <Button
              type="button"
              cargando={subiendo}
              disabled={subiendo || previa.lineas === 0}
              onClick={() => void confirmar()}
            >
              {subiendo ? "Cargando…" : `Confirmar carga de ${previa.lineas} líneas`}
            </Button>
            <Button type="button" variante="secundario" disabled={subiendo} onClick={descartar}>
              Elegir otro archivo
            </Button>
          </div>
        </section>
      )}

      {resumen && (
        <article className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-sm text-emerald-900">
            <span className="font-medium">{resumen.nombreArchivo}</span> cargado:{" "}
            {resumen.insertadas} líneas por {moneda.format(resumen.montoTotal)}
            {resumen.rechazadas > 0 && ` · ${resumen.rechazadas} rechazadas`}.
          </p>
          {resumen.porFy.map((f) => (
            <p key={f.fy} className="mt-1 text-xs text-emerald-800">
              FY {f.etiqueta}: {f.filas} líneas · {moneda.format(f.monto)}
            </p>
          ))}
        </article>
      )}
    </div>
  );
}
