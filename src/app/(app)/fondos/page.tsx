import Link from "next/link";

import { etiquetaTrimestre, fyEtiqueta, trimestreActual } from "@/lib/fiscal";
import { obtenerFySeleccionado } from "@/lib/fiscal-seleccionado";
import { moneda } from "@/lib/format";
import { agruparPorUnidad, obtenerDisponibilidad } from "@/lib/presupuesto/disponibilidad";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Fondos — IENN Gastos App" };
export const dynamic = "force-dynamic";

export default async function FondosPage() {
  const fy = await obtenerFySeleccionado();
  const tActual = trimestreActual();

  const supabase = await createSupabaseServerClient();

  const filas = await obtenerDisponibilidad(supabase, fy);
  const unidades = agruparPorUnidad(filas);

  const totalDisponibleHoy = unidades.reduce((s, u) => s + u.saldoActual, 0);
  const totalPorHabilitar = unidades.reduce((s, u) => s + u.porHabilitar, 0);
  const totalVencido = unidades.reduce((s, u) => s + u.vencidoAnual, 0);
  const totalConsumido = unidades.reduce((s, u) => s + u.consumidoAnual, 0);

  const sinPresupuesto = unidades.every((u) => u.planAnual === 0);

  return (
    <main className="mx-auto w-full max-w-[1240px] px-5 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="ui-eyebrow">Gestión de presupuesto</p>
          <h1 className="ui-title">Fondos disponibles</h1>
          <p className="ui-lead">
            Los fondos planificados se habilitan por trimestre. Lo que no se consume{" "}
            <strong>se pierde al cerrar el trimestre</strong>, salvo que exista una
            prórroga aprobada que lo arrastre al siguiente.
          </p>
        </div>

        <span className="rounded-md bg-[var(--navy)] px-3 py-1.5 text-sm font-semibold text-white">
          FY {fyEtiqueta(fy)}
        </span>
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="ui-kpi">
          <h2 className="kl">Disponible ahora ({etiquetaTrimestre(tActual)})</h2>
          <p className="kv">{moneda.format(totalDisponibleHoy)}</p>
        </article>
        <article className="ui-kpi">
          <h2 className="kl">Por habilitar</h2>
          <p className="kv">{moneda.format(totalPorHabilitar)}</p>
        </article>
        <article className="ui-kpi">
          <h2 className="kl">Consumido en el año</h2>
          <p className="kv">{moneda.format(totalConsumido)}</p>
        </article>
        <article className="ui-kpi">
          <h2 className="kl">Perdido por vencimiento</h2>
          <p className="kv" style={{ color: totalVencido > 0 ? "var(--bad)" : undefined }}>
            {moneda.format(totalVencido)}
          </p>
        </article>
      </section>

      {sinPresupuesto && (
        <p className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Todavía no hay presupuesto cargado para {fyEtiqueta(fy)}, así que no hay fondos
          que habilitar. Puedes{" "}
          <Link href="/presupuestos" className="font-semibold underline">
            cargar el Plan base
          </Link>{" "}
          o{" "}
          <Link href="/solicitudes/nueva?tipo=extra_plan" className="font-semibold underline">
            armar una solicitud de extra plan
          </Link>
          .
        </p>
      )}

      <section className="mt-8">
        <h2 className="ui-section-title">Por Orden Interna</h2>

        {unidades.length === 0 ? (
          <p className="ui-card mt-4 px-4 py-10 text-center text-sm text-[var(--muted)]">
            No hay movimiento ni presupuesto en {fyEtiqueta(fy)}.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {unidades.map((u) => (
              <article key={u.clave} className="ui-card overflow-hidden">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
                  <div>
                    <p className="font-mono text-sm font-bold text-[var(--navy)]">
                      {u.codigo}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {u.huntingZone ?? "Sin Hunting Zone asociada"}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-5 text-right">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                        Disponible ahora
                      </p>
                      <p className="text-lg font-extrabold tabular-nums text-[var(--ink)]">
                        {moneda.format(u.saldoActual)}
                      </p>
                    </div>
                    {u.vencidoAnual > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                          Perdido
                        </p>
                        <p className="text-lg font-extrabold tabular-nums text-[var(--bad)]">
                          {moneda.format(u.vencidoAnual)}
                        </p>
                      </div>
                    )}
                  </div>
                </header>

                <div className="overflow-x-auto">
                  <table className="ui-table min-w-[52rem] text-xs">
                    <thead>
                      <tr>
                        <th>Trimestre</th>
                        <th className="r">Plan</th>
                        <th className="r">Extra plan</th>
                        <th className="r">Arrastre recibido</th>
                        <th className="r">Disponible</th>
                        <th className="r">Consumido</th>
                        <th className="r">Saldo</th>
                        <th className="r">Vencido</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {u.trimestres.map((t) => {
                        const puedeProrrogar =
                          t.estado_trimestre === "cerrado" && t.vencido > 0;

                        return (
                          <tr
                            key={t.trimestre}
                            className={
                              t.estado_trimestre === "actual"
                                ? "bg-[rgba(46,117,182,0.06)]"
                                : undefined
                            }
                          >
                            <td className="whitespace-nowrap">
                              <span
                                className={
                                  t.estado_trimestre === "actual"
                                    ? "font-bold text-[var(--navy)]"
                                    : ""
                                }
                              >
                                {etiquetaTrimestre(t.trimestre)}
                              </span>
                              <span className="ml-2 text-[10px] uppercase text-[var(--muted)]">
                                {t.estado_trimestre}
                              </span>
                            </td>
                            <td className="r">{moneda.format(t.monto_plan)}</td>
                            <td className="r">{moneda.format(t.monto_extra)}</td>
                            <td className="r">
                              {t.arrastre_recibido > 0 ? (
                                <span className="font-semibold text-[var(--ok)]">
                                  +{moneda.format(t.arrastre_recibido)}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="r font-semibold text-[var(--ink)]">
                              {moneda.format(t.disponible)}
                            </td>
                            <td className="r">{moneda.format(t.consumido)}</td>
                            <td className="r font-semibold">
                              <span
                                style={{ color: t.saldo < 0 ? "var(--bad)" : undefined }}
                              >
                                {moneda.format(t.saldo)}
                              </span>
                            </td>
                            <td className="r">
                              {t.vencido > 0 ? (
                                <span className="font-semibold text-[var(--bad)]">
                                  −{moneda.format(t.vencido)}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="whitespace-nowrap">
                              {puedeProrrogar && u.idOi && (
                                <Link
                                  href={`/solicitudes/nueva?tipo=prorroga&oi=${u.idOi}&fy=${fy}&trimestre=${t.trimestre}&monto=${t.vencido}`}
                                  className="text-[11px] font-semibold text-[var(--blue)] underline"
                                >
                                  Pedir prórroga
                                </Link>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {u.idOi && (
                  <footer className="border-t border-[var(--line-soft)] px-4 py-2 text-right">
                    <Link
                      href={`/solicitudes/nueva?tipo=extra_plan&oi=${u.idOi}&fy=${fy}`}
                      className="text-xs font-semibold text-[var(--blue)] hover:underline"
                    >
                      Solicitar extra plan para esta OI →
                    </Link>
                  </footer>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
