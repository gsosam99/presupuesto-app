"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { moneda } from "@/lib/format";

export interface GrupoCruce {
  idFactura: string;
  numero: string;
  numeroOrden: string | null;
  encargado: string | null;
  codigoOi: string | null;
  huntingZone: string | null;
  montoEstimado: number | null;
  moneda: string | null;
  idsGasto: string[];
  real: number;
}

interface Props {
  grupos: GrupoCruce[];
  puedeEditar: boolean;
}

/**
 * Paso 3: lo que cruzó solo por número de factura. Se revisa y, si un cruce
 * es incorrecto, se deshace: las posiciones vuelven a pendiente y aparecen en
 * el paso 4 para asociarlas a la factura correcta.
 */
export function PasoCruceAutomatico({ grupos, puedeEditar }: Props) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deshacer(g: GrupoCruce) {
    setOcupado(true);
    setError(null);
    try {
      const res = await fetch("/api/cruces", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids_gasto: g.idsGasto }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "No se pudo deshacer el cruce.");
        return;
      }
      setConfirmando(null);
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setOcupado(false);
    }
  }

  if (grupos.length === 0) {
    return (
      <p className="ui-card px-4 py-8 text-center text-sm text-[var(--muted)]">
        Ningún gasto de esta carga cruzó solo con una factura pre-registrada. Revisa el paso
        siguiente: puede que los números estén tipeados distinto.
      </p>
    );
  }

  const totalReal = grupos.reduce((s, g) => s + g.real, 0);
  const posiciones = grupos.reduce((s, g) => s + g.idsGasto.length, 0);

  return (
    <div>
      <p className="text-sm text-[var(--ink-soft)]">
        <strong>{grupos.length}</strong> facturas cruzaron con <strong>{posiciones}</strong>{" "}
        posiciones de SAP por {moneda.format(totalReal)}. Heredaron la Orden Interna, la taxonomía y
        el encargado de la factura y quedaron aprobadas.
      </p>

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="ui-card mt-4 overflow-x-auto">
        <table className="ui-table min-w-[64rem] text-xs">
          <thead>
            <tr>
              <th>Factura</th>
              <th>N.º de orden</th>
              <th>Encargado</th>
              <th>Orden Interna</th>
              <th>Hunting Zone</th>
              <th className="r">Posiciones</th>
              <th className="r">Real SAP</th>
              <th className="r">Declarado</th>
              <th className="r">Desvío</th>
              {puedeEditar && (
                <th>
                  <span className="sr-only">Acciones</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => {
              const desvio =
                g.moneda === "USD" && g.montoEstimado !== null ? g.real - g.montoEstimado : null;
              return (
                <tr key={g.idFactura}>
                  <td className="font-mono text-[var(--ink)]">{g.numero}</td>
                  <td>{g.numeroOrden ?? "—"}</td>
                  <td>{g.encargado ?? "—"}</td>
                  <td className="font-mono">{g.codigoOi ?? "—"}</td>
                  <td>{g.huntingZone ?? "—"}</td>
                  <td className="r">{g.idsGasto.length}</td>
                  <td className="r text-[var(--ink)]">{moneda.format(g.real)}</td>
                  <td className="r">
                    {g.montoEstimado === null
                      ? "—"
                      : `${moneda.format(g.montoEstimado)} ${g.moneda ?? ""}`}
                  </td>
                  <td className="r">
                    {desvio === null ? (
                      "—"
                    ) : (
                      <span
                        className={Math.abs(desvio) < 0.01 ? "" : "font-semibold text-amber-700"}
                      >
                        {moneda.format(desvio)}
                      </span>
                    )}
                  </td>
                  {puedeEditar && (
                    <td className="whitespace-nowrap">
                      {confirmando === g.idFactura ? (
                        <span className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={ocupado}
                            onClick={() => void deshacer(g)}
                            className="font-semibold text-[var(--bad)] hover:underline disabled:opacity-50"
                          >
                            {ocupado ? "Deshaciendo…" : "Confirmar"}
                          </button>
                          <button
                            type="button"
                            disabled={ocupado}
                            onClick={() => setConfirmando(null)}
                            className="text-[var(--muted)] hover:underline"
                          >
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmando(g.idFactura)}
                          className="font-semibold text-amber-700 hover:underline"
                        >
                          Deshacer cruce
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
