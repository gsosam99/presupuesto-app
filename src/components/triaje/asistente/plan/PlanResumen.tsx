import { etiquetaMes } from "@/components/triaje/asistente/meses";
import { moneda } from "@/lib/format";
import type { ArchivoPlan } from "@/lib/ingesta/planCarga";

import { destinoDe, type FilaPlan, type NombresPlan } from "./tipos";

interface Props {
  archivos: ArchivoPlan[];
  filas: FilaPlan[];
  nombres: NombresPlan;
}

interface Linea {
  etiqueta: string;
  ayuda?: string;
  filas: FilaPlan[];
  destacada?: boolean;
}

const ETIQUETA_ESTADO: Record<FilaPlan["estado_revision"], string> = {
  aprobado: "aprobado",
  pendiente: "pendiente",
  excluido: "archivado",
};

const suma = (filas: FilaPlan[]): number => filas.reduce((s, f) => s + f.monto_real, 0);

/**
 * Paso 6: todo lo que se va a registrar, ya con las decisiones de los pasos
 * anteriores. Lo calcula el servidor con la misma lógica que la carga real,
 * así que es exactamente lo que se escribe al confirmar.
 */
export function PlanResumen({ archivos, filas, nombres }: Props) {
  // Líneas excluyentes: cada gasto cae en una sola, así suman el total.
  const aprobados = filas.filter((f) => f.estado_revision === "aprobado");
  const pendientes = filas.filter((f) => f.estado_revision === "pendiente");
  const lineas: Linea[] = [
    {
      etiqueta: "Cruce automático con factura",
      filas: aprobados.filter((f) => f.metodo_cruce === "automatico"),
    },
    {
      etiqueta: "Cruce manual con factura",
      filas: aprobados.filter((f) => f.metodo_cruce === "manual"),
    },
    {
      etiqueta: "Aprobados por la Orden Interna de SAP",
      filas: aprobados.filter((f) => f.metodo_cruce === null && !f.ajustada),
    },
    {
      etiqueta: "Completados en este asistente",
      filas: aprobados.filter((f) => f.metodo_cruce === null && f.ajustada),
    },
    {
      etiqueta: "Archivados",
      ayuda: "Hunting Zones con auto-archivar o archivados en el paso anterior.",
      filas: filas.filter((f) => f.estado_revision === "excluido"),
    },
    {
      etiqueta: "Quedarán pendientes",
      ayuda: "Se registran igual y esperan en la Sala de Triaje.",
      filas: pendientes,
      destacada: true,
    },
  ];

  const porMes = new Map<string, { cantidad: number; monto: number }>();
  for (const f of filas) {
    const mes = f.fecha.slice(0, 7);
    const acc = porMes.get(mes) ?? { cantidad: 0, monto: 0 };
    acc.cantidad += 1;
    acc.monto += f.monto_real;
    porMes.set(mes, acc);
  }
  const meses = [...porMes.entries()].sort(([a], [b]) => a.localeCompare(b));
  const oisDesconocidas = [...new Set(archivos.flatMap((a) => a.oisDesconocidas))];

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="ui-kpi">
          <p className="kl">Gastos a registrar</p>
          <p className="kv">{filas.length}</p>
        </div>
        <div className="ui-kpi">
          <p className="kl">Monto a registrar</p>
          <p className="kv">{moneda.format(suma(filas))}</p>
        </div>
        <div className="ui-kpi">
          <p className="kl">Aprobados</p>
          <p className="kv">{aprobados.length}</p>
        </div>
        <div className="ui-kpi">
          <p className="kl">Quedan pendientes</p>
          <p className="kv" style={{ color: pendientes.length > 0 ? "var(--warn)" : undefined }}>
            {pendientes.length}
          </p>
        </div>
      </section>

      <section>
        <h3 className="ui-section-title">Archivos</h3>
        <div className="ui-card mt-3 overflow-x-auto">
          <table className="ui-table min-w-[56rem] text-xs">
            <thead>
              <tr>
                <th>Archivo</th>
                <th className="r">Leídas</th>
                <th className="r">Fuera de rango</th>
                <th className="r">Posibles repetidos omitidos</th>
                <th className="r">Ya cargadas</th>
                <th className="r">Descartadas</th>
                <th className="r">A registrar</th>
                <th className="r">Monto</th>
                <th>Cuadre con SAP</th>
              </tr>
            </thead>
            <tbody>
              {archivos.map((a) => (
                <tr key={a.nombreArchivo}>
                  <td className="text-[var(--ink)]">{a.nombreArchivo}</td>
                  <td className="r">{a.filasLeidas}</td>
                  <td className="r">{a.omitidasPorFecha}</td>
                  <td className="r">{a.omitidasPorProbable}</td>
                  <td className="r">{a.yaCargadas}</td>
                  <td className="r">{a.descartadas}</td>
                  <td className="r font-semibold text-[var(--ink)]">{a.aRegistrar}</td>
                  <td className="r">{moneda.format(a.montoARegistrar)}</td>
                  <td>
                    {a.deltaTotal === null ? (
                      <span className="text-[var(--muted)]">sin total en el archivo</span>
                    ) : a.cuadra ? (
                      <span className="text-[var(--ok)]">✓ cuadra</span>
                    ) : (
                      <span className="font-semibold text-[var(--bad)]">
                        descuadre de {moneda.format(a.deltaTotal)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {oisDesconocidas.length > 0 && (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Órdenes internas que no están en la maestra:{" "}
            <span className="font-mono">{oisDesconocidas.join(", ")}</span>. Agrégalas en
            Configuración para que las próximas cargas las reconozcan.
          </p>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h3 className="ui-section-title">Cómo quedan los gastos</h3>
          <div className="ui-card mt-3 overflow-x-auto">
            <table className="ui-table text-sm">
              <tbody>
                {lineas.map((l) => (
                  <tr key={l.etiqueta} className={l.destacada ? "font-semibold" : undefined}>
                    <td className="whitespace-normal text-[var(--ink)]">
                      {l.etiqueta}
                      {l.ayuda && (
                        <span className="block text-xs font-normal text-[var(--muted)]">
                          {l.ayuda}
                        </span>
                      )}
                    </td>
                    <td className="r">{l.filas.length}</td>
                    <td className="r">{moneda.format(suma(l.filas))}</td>
                  </tr>
                ))}
                <tr className="font-semibold text-[var(--ink)]">
                  <td>Total</td>
                  <td className="r">{filas.length}</td>
                  <td className="r">{moneda.format(suma(filas))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h3 className="ui-section-title">Por mes</h3>
          <div className="ui-card mt-3 overflow-x-auto">
            <table className="ui-table text-sm">
              <tbody>
                {meses.map(([mes, m]) => (
                  <tr key={mes}>
                    <td className="text-[var(--ink)]">{etiquetaMes(mes)}</td>
                    <td className="r">{m.cantidad}</td>
                    <td className="r">{moneda.format(m.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {filas.length > 0 && (
        <details className="ui-card" open={filas.length <= 50}>
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[var(--ink)]">
            Ver los {filas.length} gastos que se registrarán
          </summary>
          <div className="max-h-[32rem] overflow-auto border-t border-[var(--line)]">
            <table className="ui-table min-w-[64rem] text-xs">
              <thead className="sticky top-0 bg-white">
                <tr>
                  <th>Fecha</th>
                  <th>Factura</th>
                  <th>Proveedor</th>
                  <th>Texto</th>
                  <th>Destino</th>
                  <th>Estado</th>
                  <th className="r">Monto</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={`${f.archivo}:${f.clave}`}>
                    <td>{f.fecha}</td>
                    <td className="font-mono">{f.factura ?? "—"}</td>
                    <td>{f.proveedor ?? f.proveedor_codigo ?? "—"}</td>
                    <td className="max-w-[18rem] truncate" title={f.texto_referencia ?? undefined}>
                      {f.texto_referencia ?? "—"}
                    </td>
                    <td>{destinoDe(f, nombres)}</td>
                    <td
                      className={
                        f.estado_revision === "pendiente"
                          ? "font-semibold text-amber-700"
                          : f.estado_revision === "excluido"
                            ? "text-[var(--muted)]"
                            : "text-[var(--ok)]"
                      }
                    >
                      {ETIQUETA_ESTADO[f.estado_revision]}
                    </td>
                    <td className="r">{moneda.format(f.monto_real)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
