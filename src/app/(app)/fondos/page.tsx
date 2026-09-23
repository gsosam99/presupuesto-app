import Link from "next/link";

import { obtenerRol } from "@/lib/auth";
import { etiquetaTrimestre, fyEtiqueta, trimestreActual } from "@/lib/fiscal";
import { obtenerFySeleccionado } from "@/lib/fiscal-seleccionado";
import { moneda } from "@/lib/format";
import { tienePermiso } from "@/lib/permisos";
import {
  claveComprometido,
  obtenerComprometido,
  obtenerFechaDatosSap,
} from "@/lib/presupuesto/comprometido";
import { agruparPorUnidad, obtenerDisponibilidad } from "@/lib/presupuesto/disponibilidad";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Fondos — IENN Gastos App" };
export const dynamic = "force-dynamic";

export default async function FondosPage() {
  const fy = await obtenerFySeleccionado();
  const tActual = trimestreActual();

  const supabase = await createSupabaseServerClient();
  const puedeSolicitar = tienePermiso(await obtenerRol(), "solicitudes:crear");

  const [filas, prorrogas, comprometido, fechaSap] = await Promise.all([
    obtenerDisponibilidad(supabase, fy),
    supabase
      .from("solicitudes")
      .select("id, estado, id_oi, id_ceco, trimestre")
      .eq("tipo", "prorroga")
      .eq("fy", fy)
      .neq("estado", "rechazada"),
    obtenerComprometido(supabase, fy),
    obtenerFechaDatosSap(supabase),
  ]);
  const unidades = agruparPorUnidad(filas);

  // Lo comprometido de facturas sin cruzar, por unidad (OI o CeCo) y trimestre.
  const comprometidoDe = (u: { idOi: string | null; idCeco: string | null }, t: number) =>
    comprometido.data.get(claveComprometido(u.idOi ?? u.idCeco ?? "", t));
  let totalComprometido = 0;
  let totalVencidasSinCruzar = 0;
  for (const c of comprometido.data.values()) {
    totalComprometido += c.usd;
    totalVencidasSinCruzar += c.facturasVencidas;
  }

  // Arrastres ya pedidos por unidad y trimestre: evita pedir dos veces el mismo.
  const arrastrePedido = new Map(
    (prorrogas.data ?? []).map((p) => [
      `${p.id_oi ?? p.id_ceco}:${p.trimestre}`,
      { id: p.id as string, estado: p.estado as string },
    ]),
  );

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
            <strong>se pierde al cerrar el trimestre</strong>, salvo que exista un
            arrastre (prórroga) aprobado que lo pase al siguiente.
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {fechaSap
              ? `Consumido según SAP: datos al ${new Date(fechaSap).toLocaleDateString("es-VE", {
                  dateStyle: "long",
                })}.`
              : "Todavía no hay cargas de SAP completadas."}
          </p>
        </div>

        <span className="rounded-md bg-[var(--navy)] px-3 py-1.5 text-sm font-semibold text-white">
          FY {fyEtiqueta(fy)}
        </span>
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
        <article className="ui-kpi">
          <h2 className="kl">Comprometido sin cruzar (app)</h2>
          <p className="kv">{moneda.format(totalComprometido)}</p>
          <Link
            href="/facturas?estado=sin_cruzar"
            className="mt-1 block text-[11px] font-semibold text-[var(--blue)] underline"
          >
            Ver facturas sin cruzar
            {totalVencidasSinCruzar > 0 && ` · ${totalVencidasSinCruzar} con más de 60 días`}
          </Link>
        </article>
      </section>

      <p className="mt-3 text-xs text-[var(--muted)]">
        <strong>Saldo</strong> es lo que queda según SAP, la única fuente del consumido.{" "}
        <strong>Comprometido</strong> son facturas USD registradas en la app que SAP todavía
        no trajo: no se descuenta del saldo, se muestra aparte y desaparece solo cuando la
        factura cruza. <strong>Saldo proyectado</strong> = saldo − comprometido. Las facturas
        en Bs y las de más de 60 días sin cruzar no suman al comprometido.
      </p>

      {comprometido.error && (
        <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          No se pudo leer lo comprometido: {comprometido.error}
        </p>
      )}

      {prorrogas.error && (
        <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          No se pudieron leer los arrastres pedidos: {prorrogas.error.message}
        </p>
      )}

      <section className="mt-6 rounded-md border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--ink-soft)]">
        <h2 className="font-semibold text-[var(--ink)]">Cómo funciona el arrastre de fondos</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            En la tabla de cada orden, usa <strong>Solicitar arrastre</strong>: en el
            trimestre en curso (preventivo, sobre el saldo de hoy) o en uno ya cerrado
            (sobre lo que venció).
          </li>
          <li>
            Se crea una solicitud de tipo arrastre (prórroga). Márcala como enviada y,
            cuando Charles y finanzas la aprueben por fuera, como aprobada en{" "}
            <Link href="/solicitudes" className="font-semibold underline">
              Solicitudes
            </Link>
            .
          </li>
          <li>
            Aprobada, el monto aparece como <strong>Arrastre recibido</strong> en el
            trimestre siguiente, hasta el saldo que efectivamente sobró al cerrar.
          </li>
        </ol>
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
                  <table className="ui-table min-w-[64rem] text-xs">
                    <thead>
                      <tr>
                        <th>Trimestre</th>
                        <th className="r">Plan</th>
                        <th className="r">Extra plan</th>
                        <th className="r">Arrastre recibido</th>
                        <th className="r">Disponible</th>
                        <th className="r">Consumido</th>
                        <th className="r">Saldo (SAP)</th>
                        <th className="r">Comprometido (app)</th>
                        <th className="r">Saldo proyectado</th>
                        <th className="r">Vencido</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {u.trimestres.map((t) => {
                        // El Q4 no tiene "siguiente" dentro del año fiscal.
                        const montoArrastre =
                          t.trimestre === 4
                            ? 0
                            : t.estado_trimestre === "actual"
                              ? Math.max(t.saldo, 0)
                              : t.estado_trimestre === "cerrado"
                                ? t.vencido
                                : 0;
                        const pedido = arrastrePedido.get(
                          `${u.idOi ?? u.idCeco}:${t.trimestre}`,
                        );
                        const unidadParam = u.idOi ? `oi=${u.idOi}` : `ceco=${u.idCeco}`;
                        const comp = comprometidoDe(u, t.trimestre);
                        const proyectado = t.saldo - (comp?.usd ?? 0);

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
                              {comp && comp.usd > 0 ? moneda.format(comp.usd) : "—"}
                              {comp && comp.facturasBs > 0 && (
                                <span className="block text-[10px] text-[var(--muted)]">
                                  + {comp.facturasBs} en Bs
                                </span>
                              )}
                            </td>
                            <td className="r">
                              {comp && comp.usd > 0 ? (
                                <span
                                  className={
                                    "font-semibold " + (proyectado < 0 ? "text-amber-700" : "")
                                  }
                                >
                                  {moneda.format(proyectado)}
                                </span>
                              ) : (
                                "—"
                              )}
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
                              {pedido ? (
                                <Link
                                  href={`/solicitudes/${pedido.id}`}
                                  className="rounded-full bg-[rgba(46,117,182,0.1)] px-2 py-0.5 text-[10px] font-semibold text-[var(--blue)]"
                                >
                                  arrastre {pedido.estado}
                                  {pedido.estado === "aprobada" &&
                                    t.estado_trimestre === "actual" &&
                                    " · se aplica al cierre"}
                                </Link>
                              ) : (
                                puedeSolicitar &&
                                montoArrastre > 0 &&
                                (u.idOi || u.idCeco) && (
                                  <Link
                                    href={`/solicitudes/nueva?tipo=prorroga&${unidadParam}&fy=${fy}&trimestre=${t.trimestre}&monto=${montoArrastre.toFixed(2)}`}
                                    className="text-[11px] font-semibold text-[var(--blue)] underline"
                                  >
                                    Solicitar arrastre
                                  </Link>
                                )
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {puedeSolicitar && u.idOi && (
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
