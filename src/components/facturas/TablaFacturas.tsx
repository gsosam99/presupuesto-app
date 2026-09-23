"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  FormularioFactura,
  type OpcionCeco,
  type OpcionOi,
  type OpcionSelect,
  type Sugerencias,
} from "@/components/facturas/FormularioFactura";
import { CONTROL_COMPACTO } from "@/components/ui/estilos";
import { moneda } from "@/lib/format";
import type { ConciliacionFactura } from "@/types";

export type FiltroEstado = "todas" | "cruzadas" | "sin_cruzar";

export interface OpcionesEdicion {
  ordenesInternas: OpcionOi[];
  cecos: OpcionCeco[];
  encargados: OpcionSelect[];
  sugerencias: Sugerencias;
  trimestreActual: string;
}

interface Props {
  filas: ConciliacionFactura[];
  /** null = el rol no puede editar: tabla de solo consulta. */
  edicion: OpcionesEdicion | null;
  estadoInicial?: FiltroEstado;
}

const POR_PAGINA = [25, 50, 100, 250] as const;
const SIN_ENCARGADO = "__sin__";

/** Confirmación en línea: el visor no garantiza confirm() y un modal más sobra. */
type Confirmacion =
  { tipo: "borrar"; ids: string[] } | { tipo: "deshacer"; id: string; numero: string } | null;

export function TablaFacturas({ filas, edicion, estadoInicial = "todas" }: Props) {
  const router = useRouter();
  const puedeEditar = edicion !== null;

  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState<FiltroEstado>(estadoInicial);
  const [encargado, setEncargado] = useState("");
  const [hz, setHz] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [porPagina, setPorPagina] = useState<number>(50);
  const [pagina, setPagina] = useState(0);

  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [editando, setEditando] = useState<ConciliacionFactura | null>(null);
  const [confirmar, setConfirmar] = useState<Confirmacion>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const encargados = useMemo(
    () => [...new Set(filas.map((f) => f.encargado).filter((e): e is string => e !== null))].sort(),
    [filas],
  );
  const zonas = useMemo(
    () =>
      [...new Set(filas.map((f) => f.hunting_zone).filter((z): z is string => z !== null))].sort(),
    [filas],
  );

  const visibles = useMemo(() => {
    const t = texto.trim().toLowerCase();
    return filas.filter((f) => {
      if (estado === "cruzadas" && !f.conciliada) return false;
      if (estado === "sin_cruzar" && f.conciliada) return false;
      if (encargado === SIN_ENCARGADO && f.encargado !== null) return false;
      if (encargado && encargado !== SIN_ENCARGADO && f.encargado !== encargado) return false;
      if (hz && f.hunting_zone !== hz) return false;
      if (desde && (!f.fecha_factura || f.fecha_factura < desde)) return false;
      if (hasta && (!f.fecha_factura || f.fecha_factura > hasta)) return false;
      if (t === "") return true;
      return [
        f.numero_factura,
        f.numero_orden,
        f.proveedor_codigo,
        f.proveedor,
        f.texto_referencia,
        f.codigo_oi,
        f.fase,
        f.motivo,
        f.detalle,
      ].some((v) => v?.toLowerCase().includes(t));
    });
  }, [filas, texto, estado, encargado, hz, desde, hasta]);

  const totalPaginas = Math.max(1, Math.ceil(visibles.length / porPagina));
  const paginaActual = Math.min(pagina, totalPaginas - 1);
  const enPagina = visibles.slice(paginaActual * porPagina, (paginaActual + 1) * porPagina);

  // Solo las no cruzadas se pueden seleccionar: la selección es para borrar.
  const seleccionables = enPagina.filter((f) => !f.conciliada);
  const marcadas = visibles.filter((f) => seleccion.has(f.id_factura_preregistrada));
  const todasMarcadas =
    seleccionables.length > 0 &&
    seleccionables.every((f) => seleccion.has(f.id_factura_preregistrada));

  const sinCruzar = filas.filter((f) => !f.conciliada);
  const comprometidoUsd = sinCruzar.reduce(
    (s, f) => s + (f.moneda === "USD" && f.monto_estimado !== null ? f.monto_estimado : 0),
    0,
  );

  useEffect(() => {
    if (!editando) return;
    function alTeclado(e: KeyboardEvent) {
      if (e.key === "Escape") setEditando(null);
    }
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, [editando]);

  function reiniciarPagina<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPagina(0);
    };
  }

  function alternar(id: string) {
    setSeleccion((prev) => {
      const copia = new Set(prev);
      if (copia.has(id)) copia.delete(id);
      else copia.add(id);
      return copia;
    });
  }

  function alternarTodas() {
    setSeleccion((prev) => {
      const copia = new Set(prev);
      for (const f of seleccionables) {
        if (todasMarcadas) copia.delete(f.id_factura_preregistrada);
        else copia.add(f.id_factura_preregistrada);
      }
      return copia;
    });
  }

  async function ejecutar(c: NonNullable<Confirmacion>) {
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      const res =
        c.tipo === "borrar"
          ? await fetch("/api/facturas", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ids: c.ids }),
            })
          : await fetch("/api/cruces", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id_factura: c.id }),
            });
      const json = (await res.json()) as {
        error?: string;
        borradas?: number;
        omitidas?: number;
        deshechos?: number;
      };
      if (!res.ok) {
        setError(json.error ?? "No se pudo completar la acción.");
        return;
      }
      if (c.tipo === "borrar") {
        setAviso(
          `${json.borradas} ${json.borradas === 1 ? "factura borrada" : "facturas borradas"}` +
            (json.omitidas ? ` · ${json.omitidas} omitidas por estar cruzadas` : "") +
            ".",
        );
        setSeleccion(new Set());
      } else {
        setAviso(
          `Cruce de ${c.numero} deshecho: ${json.deshechos} posiciones SAP volvieron al triaje.`,
        );
      }
      setConfirmar(null);
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div>
      <dl className="grid gap-4 sm:grid-cols-3">
        <div className="ui-kpi">
          <dt className="kl">Facturas del año</dt>
          <dd className="kv">{filas.length}</dd>
        </div>
        <div className="ui-kpi">
          <dt className="kl">Sin cruzar con SAP</dt>
          <dd className="kv">{sinCruzar.length}</dd>
        </div>
        <div className="ui-kpi">
          <dt className="kl">Declarado sin cruzar (USD)</dt>
          <dd className="kv">{moneda.format(comprometidoUsd)}</dd>
        </div>
      </dl>

      {/* Filtros */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <input
          value={texto}
          onChange={(e) => reiniciarPagina(setTexto)(e.target.value)}
          aria-label="Buscar"
          placeholder="Factura, n.º de orden, proveedor, texto…"
          className={`${CONTROL_COMPACTO} lg:col-span-2`}
        />
        <select
          value={estado}
          onChange={(e) => reiniciarPagina(setEstado)(e.target.value as FiltroEstado)}
          aria-label="Estado del cruce"
          className={CONTROL_COMPACTO}
        >
          <option value="todas">Todas</option>
          <option value="sin_cruzar">Sin cruzar</option>
          <option value="cruzadas">Cruzadas con SAP</option>
        </select>
        <select
          value={encargado}
          onChange={(e) => reiniciarPagina(setEncargado)(e.target.value)}
          aria-label="Encargado"
          className={CONTROL_COMPACTO}
        >
          <option value="">Todos los encargados</option>
          <option value={SIN_ENCARGADO}>Sin encargado</option>
          {encargados.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <select
          value={hz}
          onChange={(e) => reiniciarPagina(setHz)(e.target.value)}
          aria-label="Hunting Zone"
          className={CONTROL_COMPACTO}
        >
          <option value="">Todas las Hunting Zones</option>
          {zonas.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            type="date"
            value={desde}
            onChange={(e) => reiniciarPagina(setDesde)(e.target.value)}
            aria-label="Fecha desde"
            className={CONTROL_COMPACTO}
          />
          <input
            type="date"
            value={hasta}
            onChange={(e) => reiniciarPagina(setHasta)(e.target.value)}
            aria-label="Fecha hasta"
            className={CONTROL_COMPACTO}
          />
        </div>
      </div>

      {/* Barra de selección y avisos */}
      {puedeEditar && marcadas.length > 0 && !confirmar && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-[var(--ink)]">
            {marcadas.length} seleccionadas
          </span>
          <button
            type="button"
            onClick={() =>
              setConfirmar({ tipo: "borrar", ids: marcadas.map((f) => f.id_factura_preregistrada) })
            }
            className="rounded-md bg-[var(--bad)] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Eliminar
          </button>
          <button
            type="button"
            onClick={() => setSeleccion(new Set())}
            className="rounded-md border border-[var(--line)] bg-white px-3 py-1.5 text-sm text-[var(--ink)] hover:bg-[var(--line-soft)]"
          >
            Cancelar
          </button>
        </div>
      )}

      {confirmar && (
        <div
          role="alert"
          className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <span>
            {confirmar.tipo === "borrar"
              ? `¿Eliminar ${confirmar.ids.length} ${
                  confirmar.ids.length === 1 ? "factura" : "facturas"
                }? No se puede deshacer.`
              : `¿Deshacer el cruce de ${confirmar.numero}? Sus posiciones SAP pierden lo que heredaron de la factura y vuelven al triaje.`}
          </span>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void ejecutar(confirmar)}
            className="rounded-md bg-[var(--bad)] px-3 py-1.5 font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {ocupado ? "Procesando…" : "Sí, confirmar"}
          </button>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => setConfirmar(null)}
            className="rounded-md border border-[var(--line)] bg-white px-3 py-1.5 text-[var(--ink)] hover:bg-[var(--line-soft)]"
          >
            No
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      {aviso && (
        <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{aviso}</p>
      )}

      {/* Tabla */}
      <div className="ui-card mt-4 overflow-x-auto">
        <table className="ui-table min-w-[80rem] text-xs">
          <thead>
            <tr>
              {puedeEditar && (
                <th className="w-9">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar las no cruzadas de esta página"
                    checked={todasMarcadas}
                    disabled={seleccionables.length === 0}
                    onChange={alternarTodas}
                    className="h-3.5 w-3.5 rounded border-slate-300"
                  />
                </th>
              )}
              <th>Factura</th>
              <th>N.º de orden</th>
              <th>Encargado</th>
              <th>Proveedor</th>
              <th>Fecha</th>
              <th>Orden Interna</th>
              <th>Hunting Zone</th>
              <th className="r">Declarado</th>
              <th className="r">Posiciones SAP</th>
              <th className="r">Real SAP</th>
              <th className="r">Desvío</th>
              {puedeEditar && (
                <th>
                  <span className="sr-only">Acciones</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {enPagina.map((f) => {
              const id = f.id_factura_preregistrada;
              return (
                <tr key={id} className={seleccion.has(id) ? "bg-sky-50" : undefined}>
                  {puedeEditar && (
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar factura ${f.numero_factura}`}
                        checked={seleccion.has(id)}
                        disabled={f.conciliada}
                        title={
                          f.conciliada ? "Cruzada: deshaz el cruce para poder borrarla" : undefined
                        }
                        onChange={() => alternar(id)}
                        className="h-3.5 w-3.5 rounded border-slate-300"
                      />
                    </td>
                  )}
                  <td className="whitespace-nowrap font-mono text-[var(--ink)]">
                    {f.numero_factura}
                    <span
                      className={
                        "ml-2 rounded-full px-2 py-0.5 font-sans text-[10px] font-semibold " +
                        (f.conciliada
                          ? "bg-[rgba(30,138,138,0.12)] text-[var(--ok)]"
                          : "bg-slate-100 text-slate-600")
                      }
                    >
                      {f.conciliada ? "cruzada" : "sin cruzar"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">{f.numero_orden ?? "—"}</td>
                  <td className="whitespace-nowrap">{f.encargado ?? "—"}</td>
                  <td className="max-w-[12rem] truncate">
                    {f.proveedor ?? f.proveedor_codigo ?? "—"}
                  </td>
                  <td className="whitespace-nowrap tabular-nums">{f.fecha_factura ?? "—"}</td>
                  <td className="whitespace-nowrap font-mono">{f.codigo_oi ?? "—"}</td>
                  <td className="whitespace-nowrap">{f.hunting_zone ?? "—"}</td>
                  <td className="r whitespace-nowrap">
                    {f.monto_estimado === null
                      ? "—"
                      : `${moneda.format(f.monto_estimado)} ${f.moneda}`}
                  </td>
                  <td className="r">{f.posiciones_sap}</td>
                  <td className="r text-[var(--ink)]">{moneda.format(f.monto_real_sap)}</td>
                  <td className="r">
                    {f.desvio_usd === null ? (
                      <span className="text-[var(--muted)]">—</span>
                    ) : (
                      <span
                        className={
                          Math.abs(f.desvio_usd) < 0.01 ? "" : "font-semibold text-amber-700"
                        }
                      >
                        {moneda.format(f.desvio_usd)}
                      </span>
                    )}
                  </td>
                  {puedeEditar && (
                    <td className="whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setAviso(null);
                          setEditando(f);
                        }}
                        className="mr-3 font-semibold text-[var(--blue)] hover:underline"
                      >
                        Editar
                      </button>
                      {f.conciliada ? (
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmar({ tipo: "deshacer", id, numero: f.numero_factura })
                          }
                          className="font-semibold text-amber-700 hover:underline"
                        >
                          Deshacer cruce
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmar({ tipo: "borrar", ids: [id] })}
                          className="font-semibold text-[var(--bad)] hover:underline"
                        >
                          Eliminar
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}

            {enPagina.length === 0 && (
              <tr>
                <td colSpan={13} className="text-center text-[var(--muted)]">
                  {filas.length === 0
                    ? "Todavía no hay facturas pre-registradas en este año fiscal."
                    : "Ninguna factura coincide con los filtros."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2">
          <label htmlFor="facturas-por-pagina" className="text-xs text-[var(--muted)]">
            Filas por página
          </label>
          <select
            id="facturas-por-pagina"
            value={porPagina}
            onChange={(e) => reiniciarPagina(setPorPagina)(Number(e.target.value))}
            className="h-8 rounded-md border border-[var(--line)] bg-white px-2 text-sm text-[var(--ink)]"
          >
            {POR_PAGINA.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span className="text-xs text-[var(--muted)]">
            {visibles.length} de {filas.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--muted)]">
            Página {paginaActual + 1} de {totalPaginas}
          </span>
          <button
            type="button"
            disabled={paginaActual === 0}
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
            className="rounded-md border border-[var(--line)] bg-white px-3 py-1 text-[var(--ink)] hover:bg-[var(--line-soft)] disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={paginaActual >= totalPaginas - 1}
            onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
            className="rounded-md border border-[var(--line)] bg-white px-3 py-1 text-[var(--ink)] hover:bg-[var(--line-soft)] disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      </div>

      <p className="mt-3 text-xs text-[var(--muted)]">
        El desvío solo se calcula cuando el monto declarado ya estaba en USD: SAP convierte las
        facturas en Bs a la tasa BCV del día y nunca daría exacto. Una factura cruzada se puede
        editar, salvo su número y la cuenta del proveedor, que son la llave del cruce.
      </p>

      {/* Modal de edición */}
      {editando && edicion && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
          onClick={() => setEditando(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-edicion-factura"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92svh] w-full max-w-4xl overflow-y-auto rounded-t-xl bg-[var(--canvas)] p-5 shadow-xl sm:rounded-xl"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 id="titulo-edicion-factura" className="text-lg font-semibold text-[var(--ink)]">
                  Editar factura {editando.numero_factura}
                </h2>
                {editando.conciliada && (
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Cruzó con {editando.posiciones_sap}{" "}
                    {editando.posiciones_sap === 1 ? "posición" : "posiciones"} de SAP. Los cambios
                    se aplican también a ellas, salvo donde se corrigió a mano en el triaje.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setEditando(null)}
                className="rounded-md px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--line-soft)]"
              >
                Cerrar
              </button>
            </div>

            <FormularioFactura
              ordenesInternas={edicion.ordenesInternas}
              cecos={edicion.cecos}
              encargados={edicion.encargados}
              sugerencias={edicion.sugerencias}
              trimestreActual={edicion.trimestreActual}
              cruzada={editando.conciliada}
              inicial={{
                id: editando.id_factura_preregistrada,
                numero_factura: editando.numero_factura,
                numero_orden: editando.numero_orden,
                id_encargado: editando.id_encargado,
                proveedor_codigo: editando.proveedor_codigo,
                texto_referencia: editando.texto_referencia,
                fecha_factura: editando.fecha_factura,
                id_oi: editando.id_oi,
                codigo_oi: editando.codigo_oi,
                id_ceco: editando.id_ceco,
                fase: editando.fase,
                motivo: editando.motivo,
                detalle: editando.detalle,
                monto_estimado: editando.monto_estimado,
                moneda: editando.moneda,
                nota: editando.nota,
              }}
              onGuardada={(mensaje) => {
                setEditando(null);
                setAviso(mensaje);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
