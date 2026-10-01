"use client";

import { useMemo, useState } from "react";

import { CONTROL_COMPACTO } from "@/components/ui/estilos";
import { moneda } from "@/lib/format";
import { sugerirFacturas, type Sugerencia } from "@/lib/ingesta/sugerenciasCruce";
import type { FacturaSinCruzar } from "@/lib/triaje/lote";

import type { Ajustar, Ajustes, FilaPlan, Revertir } from "./tipos";

interface Props {
  /** Todas las filas del plan; acá se muestran las pendientes sin factura. */
  filas: FilaPlan[];
  facturas: FacturaSinCruzar[];
  ajustes: Ajustes;
  onAjustar: Ajustar;
  onRevertir: Revertir;
}

const POR_PAGINA = 20;

/**
 * Paso 4: gastos que no cruzaron solos. Para cada uno, las facturas
 * pre-registradas sin cruzar más parecidas. Nada se asocia sin que alguien lo
 * elija; lo que quede sin asociar sigue al paso de rezagadas.
 */
export function PlanMatchManual({ filas, facturas, ajustes, onAjustar, onRevertir }: Props) {
  const [pagina, setPagina] = useState(0);
  const [soloConSugerencia, setSoloConSugerencia] = useState(true);
  const [busqueda, setBusqueda] = useState<Record<string, string>>({});

  const facturaPorId = useMemo(() => new Map(facturas.map((f) => [f.id, f])), [facturas]);
  const facturaPorNumero = useMemo(
    () => new Map(facturas.map((f) => [f.numero_factura.trim().toUpperCase(), f])),
    [facturas],
  );

  const asociadaEnPaso = (f: FilaPlan): string | null => {
    const id = ajustes[f.clave]?.id_factura_preregistrada;
    return typeof id === "string" ? id : null;
  };

  const sinFactura = useMemo(
    () =>
      filas.filter((f) => f.estado_revision === "pendiente" && f.id_factura_preregistrada === null),
    [filas],
  );
  const asociadas = filas.filter((f) => asociadaEnPaso(f) !== null);

  const sugerencias = useMemo(() => {
    const salida: Record<string, Sugerencia[]> = {};
    for (const f of sinFactura) {
      salida[f.clave] = sugerirFacturas(
        {
          id: f.clave,
          factura: f.factura,
          proveedor_codigo: f.proveedor_codigo,
          fecha_documento: f.fecha,
          monto_real: f.monto_real,
        },
        facturas,
      );
    }
    return salida;
  }, [sinFactura, facturas]);

  const conSugerencia = sinFactura.filter((f) => (sugerencias[f.clave]?.length ?? 0) > 0).length;
  const visibles = soloConSugerencia
    ? sinFactura.filter((f) => (sugerencias[f.clave]?.length ?? 0) > 0)
    : sinFactura;
  const totalPaginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas - 1);
  const enPagina = visibles.slice(paginaActual * POR_PAGINA, (paginaActual + 1) * POR_PAGINA);

  function asociar(fila: FilaPlan, factura: FacturaSinCruzar) {
    // Se aprueba si con la factura queda proyecto; si no, el servidor la deja
    // pendiente y avisa en el paso de rezagadas.
    onAjustar([fila.clave], { id_factura_preregistrada: factura.id, estado: "aprobado" });
  }

  if (sinFactura.length === 0 && asociadas.length === 0) {
    return (
      <p className="ui-card px-4 py-8 text-center text-sm text-[var(--muted)]">
        No hay gastos de esta carga sin factura pendientes de revisión.
      </p>
    );
  }

  return (
    <div>
      <datalist id="facturas-sin-cruzar">
        {facturas.map((f) => (
          <option key={f.id} value={f.numero_factura}>
            {[f.proveedor_codigo, f.fecha_factura, f.encargado].filter(Boolean).join(" · ")}
          </option>
        ))}
      </datalist>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--ink-soft)]">
          <strong>{sinFactura.length}</strong> gastos sin factura · <strong>{conSugerencia}</strong>{" "}
          con alguna factura parecida · {facturas.length} facturas pre-registradas sin cruzar.
        </p>
        <label className="flex items-center gap-2 text-sm text-[var(--ink-soft)]">
          <input
            type="checkbox"
            checked={soloConSugerencia}
            onChange={(e) => {
              setSoloConSugerencia(e.target.checked);
              setPagina(0);
            }}
          />
          Solo los que tienen sugerencias
        </label>
      </div>

      <ul className="mt-4 space-y-3">
        {enPagina.map((g) => {
          const candidatas = (sugerencias[g.clave] ?? [])
            .map((s) => ({ s, f: facturaPorId.get(s.idFactura) }))
            .filter((c): c is { s: Sugerencia; f: FacturaSinCruzar } => c.f !== undefined);
          const escrita = facturaPorNumero.get((busqueda[g.clave] ?? "").trim().toUpperCase());

          return (
            <li key={g.clave} className="ui-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm text-[var(--ink)]">
                  <span className="font-mono">{g.factura ?? "sin n.º de factura"}</span>
                  <span className="ml-2 text-[var(--muted)]">
                    {g.fecha} · {g.proveedor ?? g.proveedor_codigo ?? "—"}
                  </span>
                </p>
                <p className="text-sm font-semibold tabular-nums text-[var(--ink)]">
                  {moneda.format(g.monto_real)}
                </p>
              </div>
              <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                {g.texto_referencia ?? "—"}
                {g.ceco_codigo_raw && ` · CeCo ${g.ceco_codigo_raw}`}
                {g.oi_codigo_raw && ` · OI ${g.oi_codigo_raw}`}
              </p>

              {candidatas.length > 0 ? (
                <ul className="mt-3 divide-y divide-[var(--line-soft)] rounded-md border border-[var(--line)]">
                  {candidatas.map(({ s, f }) => (
                    <li
                      key={f.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="text-[var(--ink)]">
                          <span className="font-mono font-semibold">{f.numero_factura}</span>
                          {f.numero_orden && (
                            <span className="ml-2 text-[var(--muted)]">orden {f.numero_orden}</span>
                          )}
                          <span className="ml-2 text-[var(--muted)]">
                            {[
                              f.proveedor_codigo,
                              f.fecha_factura,
                              f.monto_estimado !== null
                                ? `${moneda.format(f.monto_estimado)} ${f.moneda}`
                                : null,
                              f.codigo_oi,
                              f.encargado,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </p>
                        <p className="mt-0.5 text-[var(--muted)]">{s.motivos.join(" · ")}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => asociar(g, f)}
                        className="rounded-md bg-[var(--navy)] px-3 py-1 font-semibold text-white hover:opacity-90"
                      >
                        Asociar
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-[var(--muted)]">
                  Ninguna factura pre-registrada se parece a este gasto.
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  list="facturas-sin-cruzar"
                  value={busqueda[g.clave] ?? ""}
                  onChange={(e) => setBusqueda((b) => ({ ...b, [g.clave]: e.target.value }))}
                  placeholder="Otra factura: escribe su número"
                  aria-label="Buscar otra factura pre-registrada"
                  className={`${CONTROL_COMPACTO} max-w-xs`}
                />
                <button
                  type="button"
                  disabled={escrita === undefined}
                  onClick={() => escrita && asociar(g, escrita)}
                  className="rounded-md border border-[var(--line)] bg-white px-3 py-1 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--line-soft)] disabled:opacity-40"
                >
                  Asociar esta
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {visibles.length === 0 && sinFactura.length > 0 && (
        <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          No quedan gastos con sugerencias. Los demás se completan en el paso de rezagadas.
        </p>
      )}

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

      {asociadas.length > 0 && (
        <section className="mt-6">
          <h3 className="ui-section-title">Asociadas en este paso ({asociadas.length})</h3>
          <ul className="ui-card mt-2 divide-y divide-[var(--line-soft)] text-xs">
            {asociadas.map((f) => {
              const id = asociadaEnPaso(f);
              const factura = id ? facturaPorId.get(id) : undefined;
              return (
                <li
                  key={f.clave}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <span className="min-w-0 text-[var(--ink-soft)]">
                    <span className="font-mono">{f.factura ?? "sin n.º"}</span> ·{" "}
                    {moneda.format(f.monto_real)} →{" "}
                    <span className="font-mono font-semibold text-[var(--ink)]">
                      {factura?.numero_factura ?? "factura"}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onRevertir([f.clave], ["id_factura_preregistrada", "estado"])}
                    className="font-semibold text-[var(--bad)] hover:underline"
                  >
                    Quitar
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
