"use client";

import { moneda } from "@/lib/format";

import type { Ajustar, Ajustes, GrupoAutomatico, Revertir } from "./tipos";

interface Props {
  grupos: GrupoAutomatico[];
  ajustes: Ajustes;
  onAjustar: Ajustar;
  onRevertir: Revertir;
}

/**
 * Paso 3: lo que cruzó solo por número de factura. Si un cruce es incorrecto
 * se deshace (las posiciones pasan al paso 4 para asociarlas a la factura
 * correcta) y se puede restaurar. Nada se escribe todavía.
 */
export function PlanCruceAutomatico({ grupos, ajustes, onAjustar, onRevertir }: Props) {
  if (grupos.length === 0) {
    return (
      <p className="ui-card px-4 py-8 text-center text-sm text-[var(--muted)]">
        Ningún gasto de esta carga cruzó solo con una factura pre-registrada. Revisa el paso
        siguiente: puede que los números estén tipeados distinto.
      </p>
    );
  }

  const deshecho = (g: GrupoAutomatico): boolean =>
    ajustes[g.claves[0]]?.id_factura_preregistrada === null;
  const vigentes = grupos.filter((g) => !deshecho(g));
  const posiciones = vigentes.reduce((s, g) => s + g.claves.length, 0);
  const totalReal = vigentes.reduce((s, g) => s + g.real, 0);

  return (
    <div>
      <p className="text-sm text-[var(--ink-soft)]">
        <strong>{vigentes.length}</strong> facturas cruzaron con <strong>{posiciones}</strong>{" "}
        posiciones de SAP por {moneda.format(totalReal)}. Heredan la Orden Interna, la taxonomía y
        el encargado de la factura y quedarán aprobadas al confirmar.
      </p>

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
              <th>
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => {
              const anulado = deshecho(g);
              const desvio =
                g.moneda === "USD" && g.montoEstimado !== null ? g.real - g.montoEstimado : null;
              return (
                <tr key={g.idFactura} className={anulado ? "text-[var(--muted)]" : undefined}>
                  <td className={`font-mono ${anulado ? "line-through" : "text-[var(--ink)]"}`}>
                    {g.numero}
                  </td>
                  <td>{g.numeroOrden ?? "—"}</td>
                  <td>{g.encargado ?? "—"}</td>
                  <td className="font-mono">{g.codigoOi ?? "—"}</td>
                  <td>{g.huntingZone ?? "—"}</td>
                  <td className="r">{g.claves.length}</td>
                  <td className="r">{moneda.format(g.real)}</td>
                  <td className="r">
                    {g.montoEstimado === null
                      ? "—"
                      : `${moneda.format(g.montoEstimado)}${g.moneda === "USD" ? "" : ` ${g.moneda}`}`}
                  </td>
                  <td
                    className="r"
                    style={{
                      color: desvio !== null && Math.abs(desvio) >= 0.01 ? "var(--bad)" : undefined,
                    }}
                  >
                    {desvio === null ? "—" : moneda.format(desvio)}
                  </td>
                  <td className="r">
                    {anulado ? (
                      <button
                        type="button"
                        onClick={() => onRevertir(g.claves, ["id_factura_preregistrada"])}
                        className="font-semibold text-[var(--blue)] hover:underline"
                      >
                        Restaurar
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onAjustar(g.claves, { id_factura_preregistrada: null })}
                        className="font-semibold text-[var(--bad)] hover:underline"
                      >
                        Deshacer cruce
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {grupos.length > vigentes.length && (
        <p className="mt-3 text-xs text-[var(--muted)]">
          Los cruces deshechos pasan al paso siguiente para asociarlos a la factura correcta.
        </p>
      )}
    </div>
  );
}
