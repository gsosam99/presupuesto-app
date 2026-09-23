"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { CONTROL_COMPACTO } from "@/components/ui/estilos";
import { moneda } from "@/lib/format";
import type { Sugerencia } from "@/lib/ingesta/sugerenciasCruce";
import type { FacturaSinCruzar, GastoLote } from "@/lib/triaje/lote";

interface Props {
  gastos: GastoLote[];
  /** Candidatas por id de gasto, ya ordenadas por puntaje (servidor). */
  sugerencias: Record<string, Sugerencia[]>;
  facturas: FacturaSinCruzar[];
  puedeEditar: boolean;
}

const POR_PAGINA = 20;

/**
 * Paso 4: gastos de la carga que no cruzaron solos. Para cada uno se muestran
 * las facturas pre-registradas sin cruzar más parecidas, con el motivo. Nada
 * se asocia sin que alguien lo elija; lo que quede sin asociar sigue al paso
 * de rezagadas.
 */
export function PasoMatchManual({ gastos, sugerencias, facturas, puedeEditar }: Props) {
  const router = useRouter();
  const [resueltos, setResueltos] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pagina, setPagina] = useState(0);
  const [soloConSugerencia, setSoloConSugerencia] = useState(true);
  const [busqueda, setBusqueda] = useState<Record<string, string>>({});

  const facturaPorId = useMemo(() => new Map(facturas.map((f) => [f.id, f])), [facturas]);
  const facturaPorNumero = useMemo(
    () => new Map(facturas.map((f) => [f.numero_factura.trim().toUpperCase(), f])),
    [facturas],
  );

  const visibles = gastos.filter(
    (g) => !resueltos.has(g.id) && (!soloConSugerencia || (sugerencias[g.id]?.length ?? 0) > 0),
  );
  const conSugerencia = gastos.filter(
    (g) => !resueltos.has(g.id) && (sugerencias[g.id]?.length ?? 0) > 0,
  ).length;
  const totalPaginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas - 1);
  const enPagina = visibles.slice(paginaActual * POR_PAGINA, (paginaActual + 1) * POR_PAGINA);

  async function asociar(gasto: GastoLote, factura: FacturaSinCruzar) {
    setOcupado(gasto.id);
    setError(null);
    try {
      // Aprobar sin proyecto dejaría un gasto contando en los KPIs sin dueño:
      // si ni la factura ni el gasto tienen HZ, se asocia y queda pendiente.
      const aprobar = factura.hunting_zone !== null || gasto.id_hunting_zone !== null;
      const res = await fetch("/api/triaje", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: [gasto.id],
          accion: "guardar",
          id_factura_preregistrada: factura.id,
          aprobar,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "No se pudo asociar la factura.");
        return;
      }
      setResueltos((prev) => new Set([...prev, gasto.id]));
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setOcupado(null);
    }
  }

  if (gastos.length === 0) {
    return (
      <p className="ui-card px-4 py-8 text-center text-sm text-[var(--muted)]">
        No quedan gastos de esta carga sin factura pendientes de revisión.
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
          <strong>{gastos.length - resueltos.size}</strong> gastos sin factura ·{" "}
          <strong>{conSugerencia}</strong> con alguna factura parecida · {facturas.length} facturas
          pre-registradas sin cruzar.
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

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <ul className="mt-4 space-y-3">
        {enPagina.map((g) => {
          const candidatas = (sugerencias[g.id] ?? [])
            .map((s) => ({ s, f: facturaPorId.get(s.idFactura) }))
            .filter((c): c is { s: Sugerencia; f: FacturaSinCruzar } => c.f !== undefined);
          const escrita = facturaPorNumero.get((busqueda[g.id] ?? "").trim().toUpperCase());
          const bloqueado = ocupado === g.id || !puedeEditar;

          return (
            <li key={g.id} className="ui-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm text-[var(--ink)]">
                  <span className="font-mono">{g.factura ?? "sin n.º de factura"}</span>
                  <span className="ml-2 text-[var(--muted)]">
                    {g.fecha_documento} · {g.proveedor ?? g.proveedor_codigo ?? "—"}
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
                      <div>
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
                        disabled={bloqueado}
                        onClick={() => void asociar(g, f)}
                        className="rounded-md bg-[var(--navy)] px-3 py-1 font-semibold text-white hover:opacity-90 disabled:opacity-50"
                      >
                        {ocupado === g.id ? "Asociando…" : "Asociar"}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-[var(--muted)]">
                  Ninguna factura pre-registrada se parece a este gasto.
                </p>
              )}

              {puedeEditar && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    list="facturas-sin-cruzar"
                    value={busqueda[g.id] ?? ""}
                    onChange={(e) => setBusqueda((b) => ({ ...b, [g.id]: e.target.value }))}
                    placeholder="Otra factura: escribe su número"
                    aria-label="Buscar otra factura pre-registrada"
                    className={`${CONTROL_COMPACTO} max-w-xs`}
                  />
                  <button
                    type="button"
                    disabled={bloqueado || escrita === undefined}
                    onClick={() => escrita && void asociar(g, escrita)}
                    className="rounded-md border border-[var(--line)] bg-white px-3 py-1 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--line-soft)] disabled:opacity-40"
                  >
                    Asociar esta
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {visibles.length === 0 && (
        <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {soloConSugerencia && gastos.length > resueltos.size
            ? "No quedan gastos con sugerencias. Los demás se completan en el paso de rezagadas."
            : "Todos los gastos de este paso quedaron resueltos."}
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
    </div>
  );
}
