"use client";

import { useMemo, useState } from "react";

import { CampoSugerido, ListaSugerencias } from "@/components/ui/CampoSugerido";
import { CONTROL_CELDA } from "@/components/ui/estilos";
import {
  etiquetasPlan,
  type OpcionAsignacion,
  type Sugerencias,
} from "@/components/triaje/TablaTriaje";
import { moneda } from "@/lib/format";

import {
  destinoDe,
  type AjusteGasto,
  type Ajustar,
  type FilaPlan,
  type NombresPlan,
} from "./tipos";

interface Props {
  filas: FilaPlan[];
  nombres: NombresPlan;
  asignaciones: OpcionAsignacion[];
  sugerencias: Sugerencias;
  encargados: Array<{ id: string; etiqueta: string }>;
  onAjustar: Ajustar;
}

interface Borrador {
  asignacion: string;
  fase: string;
  motivo: string;
  detalle: string;
  id_encargado: string;
}

const VACIO: Borrador = { asignacion: "", fase: "", motivo: "", detalle: "", id_encargado: "" };
const POR_PAGINA = 25;

/** Solo los campos escritos: un campo vacío no pisa lo que la fila ya trae. */
function aAjuste(b: Borrador): AjusteGasto {
  const a: AjusteGasto = {};
  if (b.asignacion.trim()) a.asignacion = b.asignacion.trim();
  if (b.fase.trim()) a.fase = b.fase.trim();
  if (b.motivo.trim()) a.motivo = b.motivo.trim();
  if (b.detalle.trim()) a.detalle = b.detalle.trim();
  if (b.id_encargado) a.id_encargado = b.id_encargado;
  return a;
}

/**
 * Paso 5: lo que sigue pendiente después de los cruces. Se completa la Orden
 * Interna o etiqueta, la taxonomía y el encargado; o se archiva. Lo que quede
 * pendiente al confirmar se registra igual y espera en la Sala de Triaje.
 */
export function PlanRezagadas({
  filas,
  nombres,
  asignaciones,
  sugerencias,
  encargados,
  onAjustar,
}: Props) {
  const [borradores, setBorradores] = useState<Record<string, Borrador>>({});
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [masivo, setMasivo] = useState<Borrador>(VACIO);
  const [pagina, setPagina] = useState(0);

  const validas = useMemo(
    () => new Set(asignaciones.map((a) => a.valor.toUpperCase())),
    [asignaciones],
  );
  const pendientes = useMemo(() => filas.filter((f) => f.estado_revision === "pendiente"), [filas]);

  const totalPaginas = Math.max(1, Math.ceil(pendientes.length / POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas - 1);
  const enPagina = pendientes.slice(paginaActual * POR_PAGINA, (paginaActual + 1) * POR_PAGINA);
  const montoPendiente = pendientes.reduce((s, f) => s + f.monto_real, 0);

  const borradorDe = (clave: string): Borrador => borradores[clave] ?? VACIO;
  const editar = (clave: string, campo: keyof Borrador, valor: string): void =>
    setBorradores((b) => ({ ...b, [clave]: { ...borradorDe(clave), [campo]: valor } }));

  const asignacionInvalida = (valor: string): boolean =>
    valor.trim() !== "" && !validas.has(valor.trim().toUpperCase());
  const puedeAprobar = (f: FilaPlan, b: Borrador): boolean =>
    !asignacionInvalida(b.asignacion) && (b.asignacion.trim() !== "" || f.id_hunting_zone !== null);

  function resolver(claves: string[], ajuste: AjusteGasto) {
    onAjustar(claves, ajuste);
    setSeleccion((s) => new Set([...s].filter((c) => !claves.includes(c))));
  }

  if (pendientes.length === 0) {
    return (
      <p className="ui-card px-4 py-8 text-center text-sm text-[var(--muted)]">
        No quedan gastos pendientes en esta carga: todo tiene proyecto asignado o fue archivado.
      </p>
    );
  }

  const todosEnPagina = enPagina.length > 0 && enPagina.every((f) => seleccion.has(f.clave));
  const seleccionadas = pendientes.filter((f) => seleccion.has(f.clave));
  const masivoAprobable =
    seleccionadas.length > 0 &&
    !asignacionInvalida(masivo.asignacion) &&
    (masivo.asignacion.trim() !== "" || seleccionadas.every((f) => f.id_hunting_zone !== null));

  return (
    <div>
      <datalist id="plan-asignaciones">
        {asignaciones.map((a) => (
          <option key={a.valor} value={a.valor}>
            {a.descripcion}
          </option>
        ))}
      </datalist>
      <ListaSugerencias id="plan-fase" sugerencias={sugerencias.fase} />
      <ListaSugerencias
        id="plan-motivo"
        sugerencias={sugerencias.motivo}
        etiquetas={etiquetasPlan(sugerencias.motivosPlan)}
      />
      <ListaSugerencias id="plan-detalle" sugerencias={sugerencias.detalle} />

      <p className="text-sm text-[var(--ink-soft)]">
        <strong>{pendientes.length}</strong> gastos pendientes por {moneda.format(montoPendiente)}.
        Asigna la Orden Interna o una etiqueta (#CAM), la taxonomía y el encargado, y apruébalos.
        Los que dejes pendientes se registran igual y esperan en la Sala de Triaje.
      </p>

      {seleccionadas.length > 0 && (
        <div className="ui-card mt-4 border-[var(--blue)] p-3">
          <p className="text-xs font-semibold text-[var(--navy)]">
            {seleccionadas.length} seleccionados: lo que escribas acá se aplica a todos.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <input
              list="plan-asignaciones"
              aria-label="Orden Interna o etiqueta para los seleccionados"
              placeholder="OI o #etiqueta"
              value={masivo.asignacion}
              onChange={(e) => setMasivo((m) => ({ ...m, asignacion: e.target.value }))}
              className={`${CONTROL_CELDA} ${asignacionInvalida(masivo.asignacion) ? "border-[var(--bad)]" : ""}`}
            />
            <CampoSugerido
              idLista="plan-fase"
              aria-label="Fase"
              placeholder="Fase"
              value={masivo.fase}
              onChange={(e) => setMasivo((m) => ({ ...m, fase: e.target.value }))}
              className={CONTROL_CELDA}
            />
            <CampoSugerido
              idLista="plan-motivo"
              aria-label="Motivo"
              placeholder="Motivo"
              value={masivo.motivo}
              onChange={(e) => setMasivo((m) => ({ ...m, motivo: e.target.value }))}
              className={CONTROL_CELDA}
            />
            <CampoSugerido
              idLista="plan-detalle"
              aria-label="Detalle"
              placeholder="Detalle"
              value={masivo.detalle}
              onChange={(e) => setMasivo((m) => ({ ...m, detalle: e.target.value }))}
              className={CONTROL_CELDA}
            />
            <select
              aria-label="Encargado"
              value={masivo.id_encargado}
              onChange={(e) => setMasivo((m) => ({ ...m, id_encargado: e.target.value }))}
              className={CONTROL_CELDA}
            >
              <option value="">Encargado…</option>
              {encargados.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.etiqueta}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!masivoAprobable}
                onClick={() => {
                  resolver(
                    seleccionadas.map((f) => f.clave),
                    { ...aAjuste(masivo), estado: "aprobado" },
                  );
                  setMasivo(VACIO);
                }}
                className="flex-1 rounded-md bg-[var(--navy)] px-2 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
              >
                Aprobar
              </button>
              <button
                type="button"
                onClick={() =>
                  resolver(
                    seleccionadas.map((f) => f.clave),
                    { estado: "excluido" },
                  )
                }
                className="rounded-md border border-[var(--line)] bg-white px-2 py-1 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--line-soft)]"
              >
                Archivar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="ui-card mt-4 overflow-x-auto">
        <table className="ui-table min-w-[80rem] text-xs">
          <thead>
            <tr>
              <th className="w-8">
                <input
                  type="checkbox"
                  aria-label="Seleccionar los de esta página"
                  checked={todosEnPagina}
                  onChange={(e) =>
                    setSeleccion((s) => {
                      const n = new Set(s);
                      for (const f of enPagina) {
                        if (e.target.checked) n.add(f.clave);
                        else n.delete(f.clave);
                      }
                      return n;
                    })
                  }
                />
              </th>
              <th>Gasto</th>
              <th className="r">Monto</th>
              <th className="w-40">OI / etiqueta</th>
              <th className="w-32">Fase</th>
              <th className="w-32">Motivo</th>
              <th className="w-32">Detalle</th>
              <th className="w-36">Encargado</th>
              <th>
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {enPagina.map((f) => {
              const b = borradorDe(f.clave);
              const invalida = asignacionInvalida(b.asignacion);
              return (
                <tr key={f.clave} className="align-top">
                  <td>
                    <input
                      type="checkbox"
                      aria-label="Seleccionar"
                      checked={seleccion.has(f.clave)}
                      onChange={(e) =>
                        setSeleccion((s) => {
                          const n = new Set(s);
                          if (e.target.checked) n.add(f.clave);
                          else n.delete(f.clave);
                          return n;
                        })
                      }
                    />
                  </td>
                  <td className="max-w-[22rem] whitespace-normal">
                    <p className="text-[var(--ink)]">
                      <span className="font-mono">{f.factura ?? "sin factura"}</span> · {f.fecha} ·{" "}
                      {f.proveedor ?? f.proveedor_codigo ?? "—"}
                    </p>
                    <p className="text-[var(--muted)]">
                      {f.texto_referencia ?? "—"}
                      {f.ceco_codigo_raw && ` · CeCo ${f.ceco_codigo_raw}`}
                      {f.oi_codigo_raw && ` · OI ${f.oi_codigo_raw}`}
                    </p>
                    <p className="text-[var(--muted)]">Hoy: {destinoDe(f, nombres)}</p>
                    {f.aviso && (
                      <p className="mt-1 rounded bg-amber-50 px-1.5 py-0.5 text-amber-900">
                        {f.aviso}
                      </p>
                    )}
                  </td>
                  <td className="r font-semibold text-[var(--ink)]">
                    {moneda.format(f.monto_real)}
                  </td>
                  <td>
                    <input
                      list="plan-asignaciones"
                      aria-label="Orden Interna o etiqueta"
                      placeholder="OI o #etiqueta"
                      value={b.asignacion}
                      onChange={(e) => editar(f.clave, "asignacion", e.target.value)}
                      className={`${CONTROL_CELDA} ${invalida ? "border-[var(--bad)]" : ""}`}
                    />
                    {invalida && <p className="mt-0.5 text-[var(--bad)]">No existe</p>}
                  </td>
                  <td>
                    <CampoSugerido
                      idLista="plan-fase"
                      aria-label="Fase"
                      placeholder={f.fase ?? ""}
                      value={b.fase}
                      onChange={(e) => editar(f.clave, "fase", e.target.value)}
                      className={CONTROL_CELDA}
                    />
                  </td>
                  <td>
                    <CampoSugerido
                      idLista="plan-motivo"
                      aria-label="Motivo"
                      placeholder={f.motivo ?? ""}
                      value={b.motivo}
                      onChange={(e) => editar(f.clave, "motivo", e.target.value)}
                      className={CONTROL_CELDA}
                    />
                  </td>
                  <td>
                    <CampoSugerido
                      idLista="plan-detalle"
                      aria-label="Detalle"
                      placeholder={f.detalle ?? ""}
                      value={b.detalle}
                      onChange={(e) => editar(f.clave, "detalle", e.target.value)}
                      className={CONTROL_CELDA}
                    />
                  </td>
                  <td>
                    <select
                      aria-label="Encargado"
                      value={b.id_encargado || f.id_encargado || ""}
                      onChange={(e) => editar(f.clave, "id_encargado", e.target.value)}
                      className={CONTROL_CELDA}
                    >
                      <option value="">—</option>
                      {encargados.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.etiqueta}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="whitespace-nowrap">
                    <button
                      type="button"
                      disabled={!puedeAprobar(f, b)}
                      title={puedeAprobar(f, b) ? undefined : "Falta la Orden Interna o etiqueta"}
                      onClick={() => resolver([f.clave], { ...aAjuste(b), estado: "aprobado" })}
                      className="mr-3 font-semibold text-[var(--ok)] hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Aprobar
                    </button>
                    <button
                      type="button"
                      onClick={() => resolver([f.clave], { estado: "excluido" })}
                      className="text-[var(--muted)] hover:underline"
                    >
                      Archivar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPaginas > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <span className="text-xs text-[var(--muted)]">
            Página {paginaActual + 1} de {totalPaginas}
          </span>
          <button
            type="button"
            disabled={paginaActual === 0}
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
            className="rounded-md border border-[var(--line)] bg-white px-3 py-1 hover:bg-[var(--line-soft)] disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={paginaActual >= totalPaginas - 1}
            onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
            className="rounded-md border border-[var(--line)] bg-white px-3 py-1 hover:bg-[var(--line-soft)] disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
