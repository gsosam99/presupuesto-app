"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export interface GastoArchivado {
  id: string;
  fecha_documento: string;
  factura: string | null;
  proveedor: string | null;
  proveedor_codigo: string | null;
  texto_referencia: string | null;
  grupo_clase_coste: string | null;
  monto_real: number;
  ceco_codigo_raw: string | null;
  oi_codigo_raw: string | null;
  hunting_zone: string | null;
}

const moneda = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function TablaArchivados({ gastos }: { gastos: GastoArchivado[] }) {
  const router = useRouter();
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [devueltos, setDevueltos] = useState<Set<string>>(new Set());
  const [enProceso, setEnProceso] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");

  const visibles = useMemo(() => {
    const t = filtro.trim().toLowerCase();
    return gastos.filter((g) => {
      if (devueltos.has(g.id)) return false;
      if (t === "") return true;
      return [
        g.texto_referencia,
        g.proveedor,
        g.proveedor_codigo,
        g.factura,
        g.oi_codigo_raw,
        g.ceco_codigo_raw,
      ]
        .filter((v): v is string => typeof v === "string")
        .some((v) => v.toLowerCase().includes(t));
    });
  }, [gastos, devueltos, filtro]);

  const marcados = visibles.filter((g) => seleccion.has(g.id));
  const todos = visibles.length > 0 && marcados.length === visibles.length;
  const montoVisible = visibles.reduce((s, g) => s + g.monto_real, 0);

  async function devolverAlTriaje(objetivo: GastoArchivado[]) {
    if (objetivo.length === 0) return;
    setEnProceso(true);
    setError(null);

    try {
      const res = await fetch("/api/triaje", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: objetivo.map((g) => g.id), accion: "reabrir" }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "No se pudo devolver al triaje.");
        return;
      }
      setDevueltos((prev) => new Set([...prev, ...objetivo.map((g) => g.id)]));
      setSeleccion(new Set());
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setEnProceso(false);
    }
  }

  if (gastos.length === 0) {
    return (
      <p className="ui-card px-4 py-10 text-center text-sm text-[var(--muted)]">
        No hay gastos archivados.
      </p>
    );
  }

  return (
    <div>
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-3">
        {marcados.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-[var(--ink)]">
              {marcados.length} seleccionados
            </span>
            <button
              type="button"
              disabled={enProceso}
              onClick={() => void devolverAlTriaje(marcados)}
              className="rounded-md bg-[var(--blue)] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              Devolver al triaje
            </button>
            <button
              type="button"
              onClick={() => setSeleccion(new Set())}
              className="rounded-md border border-[var(--line)] bg-white px-3 py-1.5 text-sm text-[var(--ink-soft)] hover:bg-[var(--line-soft)]"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            aria-label="Buscar"
            placeholder="Buscar"
            className="h-9 w-72 rounded-md border border-[var(--line)] bg-white px-3 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[rgba(46,117,182,0.25)]"
          />
        )}

        <span className="text-xs text-[var(--muted)]">
          {visibles.length} archivados · {moneda.format(montoVisible)}
        </span>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-[var(--bad)]">
          {error}
        </p>
      )}

      <div className="ui-card mt-3 overflow-x-auto">
        <table className="ui-table min-w-[64rem] text-xs">
          <thead>
            <tr>
              <th className="w-9">
                <input
                  type="checkbox"
                  aria-label="Seleccionar todos"
                  checked={todos}
                  onChange={() =>
                    setSeleccion(todos ? new Set() : new Set(visibles.map((g) => g.id)))
                  }
                  className="h-3.5 w-3.5 rounded border-slate-300"
                />
              </th>
              <th>Fecha</th>
              <th>Texto de referencia</th>
              <th>Proveedor</th>
              <th>Factura</th>
              <th className="r">Monto</th>
              <th>CeCo / OI de SAP</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((g) => (
              <tr key={g.id} className={seleccion.has(g.id) ? "bg-sky-50" : undefined}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Seleccionar gasto del ${g.fecha_documento}`}
                    checked={seleccion.has(g.id)}
                    onChange={() =>
                      setSeleccion((prev) => {
                        const c = new Set(prev);
                        if (c.has(g.id)) c.delete(g.id);
                        else c.add(g.id);
                        return c;
                      })
                    }
                    className="h-3.5 w-3.5 rounded border-slate-300"
                  />
                </td>
                <td className="whitespace-nowrap tabular-nums">{g.fecha_documento}</td>
                <td className="max-w-[22rem]">
                  <p className="truncate text-[var(--ink)]">{g.texto_referencia ?? "—"}</p>
                  {g.grupo_clase_coste && (
                    <p className="truncate text-[10px] text-[var(--muted)]">
                      {g.grupo_clase_coste}
                    </p>
                  )}
                </td>
                <td className="max-w-[12rem] truncate">
                  {g.proveedor ?? g.proveedor_codigo ?? "—"}
                </td>
                <td className="whitespace-nowrap font-mono text-[11px]">{g.factura ?? "—"}</td>
                <td className="r whitespace-nowrap text-[var(--ink)]">
                  {moneda.format(g.monto_real)}
                </td>
                <td className="whitespace-nowrap text-[var(--muted)]">
                  {g.ceco_codigo_raw ?? "sin CeCo"} · {g.oi_codigo_raw ?? "sin OI"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {visibles.length === 0 && (
        <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {filtro ? "Ningún archivado coincide con la búsqueda." : "No quedan archivados."}
        </p>
      )}
    </div>
  );
}
