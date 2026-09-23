import Link from "next/link";

import { moneda } from "@/lib/format";
import type { CargaLote, GastoLote } from "@/lib/triaje/lote";

interface Props {
  cargas: CargaLote[];
  gastos: GastoLote[];
}

interface Linea {
  etiqueta: string;
  cantidad: number;
  monto: number;
  ayuda?: string;
  destacada?: boolean;
}

function linea(
  etiqueta: string,
  filas: GastoLote[],
  extra?: Pick<Linea, "ayuda" | "destacada">,
): Linea {
  return {
    etiqueta,
    cantidad: filas.length,
    monto: filas.reduce((s, g) => s + g.monto_real, 0),
    ...extra,
  };
}

/**
 * Paso 6: todo lo que pasó con la carga. La parte de "archivo" sale del
 * resumen guardado al cargar; la de "resolución" se recalcula del estado
 * actual de los gastos, así que refleja también lo resuelto días después.
 */
export function PasoResumen({ cargas, gastos }: Props) {
  const r = cargas.flatMap((c) => (c.resumen ? [c.resumen] : []));
  const suma = (f: (x: (typeof r)[number]) => number): number => r.reduce((s, x) => s + f(x), 0);

  const automaticos = gastos.filter((g) => g.metodo_cruce === "automatico");
  const manuales = gastos.filter((g) => g.metodo_cruce === "manual");
  const sinCruce = gastos.filter((g) => g.metodo_cruce === null);

  const lineasResolucion: Linea[] = [
    linea("Cruce automático con factura", automaticos),
    linea("Cruce manual con factura", manuales),
    linea(
      "Aprobados por la Orden Interna de SAP",
      sinCruce.filter(
        (g) =>
          g.estado_revision === "aprobado" &&
          g.origen_hz === "orden_interna" &&
          g.revisado_at === null,
      ),
    ),
    linea(
      "Completados en el triaje",
      sinCruce.filter(
        (g) =>
          g.estado_revision === "aprobado" &&
          !(g.origen_hz === "orden_interna" && g.revisado_at === null),
      ),
    ),
    linea(
      "Archivados",
      sinCruce.filter((g) => g.estado_revision === "excluido"),
      { ayuda: "Hunting Zones con auto-archivar o archivados a mano." },
    ),
    linea(
      "Todavía pendientes",
      gastos.filter((g) => g.estado_revision === "pendiente"),
      { destacada: true },
    ),
  ];

  const pendientes = lineasResolucion[lineasResolucion.length - 1];

  return (
    <div className="space-y-8">
      <section>
        <h3 className="ui-section-title">Archivos</h3>
        <div className="ui-card mt-3 overflow-x-auto">
          <table className="ui-table min-w-[56rem] text-xs">
            <thead>
              <tr>
                <th>Archivo</th>
                <th className="r">Leídas</th>
                <th className="r">Fuera de rango</th>
                <th className="r">Probables omitidas</th>
                <th className="r">Duplicadas</th>
                <th className="r">Descartadas</th>
                <th className="r">Insertadas</th>
                <th className="r">Monto cargado</th>
                <th>Cuadre con SAP</th>
              </tr>
            </thead>
            <tbody>
              {cargas.map((c) => {
                const x = c.resumen;
                const cuadra =
                  x?.deltaTotal === null || x?.deltaTotal === undefined
                    ? null
                    : x.deltaTotal <= 0.005 * x.filasLeidas;
                return (
                  <tr key={c.id}>
                    <td className="text-[var(--ink)]">
                      {c.nombre_archivo}
                      {c.estado === "revertida" && (
                        <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold">
                          revertida
                        </span>
                      )}
                    </td>
                    <td className="r">{x?.filasLeidas ?? "—"}</td>
                    <td className="r">{x?.omitidasPorFecha ?? "—"}</td>
                    <td className="r">{x?.omitidasPorProbable ?? "—"}</td>
                    <td className="r">{x?.duplicadas ?? "—"}</td>
                    <td className="r">{x?.rechazadas ?? "—"}</td>
                    <td className="r font-semibold text-[var(--ink)]">{x?.insertadas ?? "—"}</td>
                    <td className="r">{x ? moneda.format(x.montoReal) : "—"}</td>
                    <td>
                      {cuadra === null ? (
                        <span className="text-[var(--muted)]">sin total en el archivo</span>
                      ) : cuadra ? (
                        <span className="text-[var(--ok)]">✓ cuadra</span>
                      ) : (
                        <span className="font-semibold text-[var(--bad)]">
                          descuadre de {moneda.format(x?.deltaTotal ?? 0)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {cargas.length > 1 && (
              <tfoot>
                <tr className="font-semibold text-[var(--ink)]">
                  <td className="px-3 py-2">Total</td>
                  <td className="r px-3">{suma((x) => x.filasLeidas)}</td>
                  <td className="r px-3">{suma((x) => x.omitidasPorFecha)}</td>
                  <td className="r px-3">{suma((x) => x.omitidasPorProbable)}</td>
                  <td className="r px-3">{suma((x) => x.duplicadas)}</td>
                  <td className="r px-3">{suma((x) => x.rechazadas)}</td>
                  <td className="r px-3">{suma((x) => x.insertadas)}</td>
                  <td className="r px-3">{moneda.format(suma((x) => x.montoReal))}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {r.some((x) => x.oisDesconocidas.length > 0) && (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Órdenes internas que no están en la maestra:{" "}
            <span className="font-mono">
              {[...new Set(r.flatMap((x) => x.oisDesconocidas))].join(", ")}
            </span>
            . Agrégalas en Configuración para que las próximas cargas las reconozcan.
          </p>
        )}
      </section>

      <section>
        <h3 className="ui-section-title">Resolución de los gastos cargados</h3>
        <div className="ui-card mt-3 overflow-x-auto">
          <table className="ui-table min-w-[36rem] text-sm">
            <tbody>
              {lineasResolucion.map((l) => (
                <tr key={l.etiqueta} className={l.destacada ? "font-semibold" : undefined}>
                  <td className="text-[var(--ink)]">
                    {l.etiqueta}
                    {l.ayuda && (
                      <span className="block text-xs font-normal text-[var(--muted)]">
                        {l.ayuda}
                      </span>
                    )}
                  </td>
                  <td className="r">{l.cantidad}</td>
                  <td className="r">{moneda.format(l.monto)}</td>
                </tr>
              ))}
              <tr className="font-semibold text-[var(--ink)]">
                <td>Total del lote</td>
                <td className="r">{gastos.length}</td>
                <td className="r">{moneda.format(gastos.reduce((s, g) => s + g.monto_real, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {pendientes.cantidad > 0 ? (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Quedan {pendientes.cantidad} gastos pendientes por {moneda.format(pendientes.monto)}.
            Siguen en la{" "}
            <Link href="/triaje" className="font-semibold underline">
              Sala de Triaje
            </Link>{" "}
            y cuentan como &quot;sin asignar&quot; en el dashboard hasta que se completen.
          </p>
        ) : (
          <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Todos los gastos de esta carga quedaron resueltos.
          </p>
        )}
      </section>
    </div>
  );
}
