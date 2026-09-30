"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useAvisos } from "@/components/ui/Avisos";
import { ModalConfirmacion } from "@/components/ui/ModalConfirmacion";
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
  const avisos = useAvisos();
  const [confirmando, setConfirmando] = useState<GrupoCruce | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function deshacer(g: GrupoCruce) {
    setOcupado(true);
    try {
      const res = await fetch("/api/cruces", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids_gasto: g.idsGasto }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        avisos.error(json.error ?? "No se pudo deshacer el cruce.");
        return;
      }
      setConfirmando(null);
      avisos.exito(
        `Cruce de ${g.numero} deshecho: ${g.idsGasto.length} ${
          g.idsGasto.length === 1 ? "posición volvió" : "posiciones volvieron"
        } a pendientes.`,
      );
      router.refresh();
    } catch {
      avisos.error("No se pudo conectar con el servidor.");
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

      {confirmando && (
        <ModalConfirmacion
          titulo={`Deshacer el cruce de ${confirmando.numero}`}
          textoConfirmar="Deshacer cruce"
          peligro
          procesando={ocupado}
          onConfirmar={() => void deshacer(confirmando)}
          onCancelar={() => setConfirmando(null)}
        >
          <p>
            Sus {confirmando.idsGasto.length} posiciones de SAP pierden lo que heredaron de la
            factura y vuelven a pendientes: aparecerán en el paso siguiente para asociarlas a la
            factura correcta.
          </p>
        </ModalConfirmacion>
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
                      <button
                        type="button"
                        onClick={() => setConfirmando(g)}
                        className="font-semibold text-amber-700 hover:underline"
                      >
                        Deshacer cruce
                      </button>
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
