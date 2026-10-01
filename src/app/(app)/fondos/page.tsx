import Link from "next/link";

import { requireRol } from "@/lib/auth";
import { etiquetaTrimestre, fyEtiqueta, nombreMes } from "@/lib/fiscal";
import { obtenerFySeleccionado } from "@/lib/fiscal-seleccionado";
import { moneda } from "@/lib/format";
import { tienePermiso } from "@/lib/permisos";
import { agruparPorUnidad, obtenerFondos, type UnidadFondos } from "@/lib/presupuesto/fondos";
import {
  clavePreregistrado,
  obtenerFechaDatosSap,
  obtenerPreregistrado,
} from "@/lib/presupuesto/preregistrado";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EstadoTrimestre } from "@/types";

export const metadata = { title: "Fondos — IENN Gastos App" };
export const dynamic = "force-dynamic";

const ETIQUETA_ESTADO_MES: Record<EstadoTrimestre, string> = {
  cerrado: "cerrado",
  actual: "en curso",
  futuro: "por habilitar",
};

/** Muestra "—" en vez de 0,00 para que las columnas vacías no distraigan. */
function monto(valor: number): string {
  return Math.abs(valor) < 0.005 ? "—" : moneda.format(valor);
}

const SIN_HZ = "sin-hz";

/** Nombre del grupo de Hunting Zone de una unidad (los CeCo van aparte). */
function grupoDe(u: UnidadFondos): string {
  if (u.huntingZone) return u.huntingZone;
  return u.idCeco ? "Centros de Costo" : "Sin Hunting Zone";
}

function slugGrupo(nombre: string): string {
  return nombre === "Sin Hunting Zone" ? SIN_HZ : nombre;
}

export default async function FondosPage({
  searchParams,
}: {
  searchParams: Promise<{ hz?: string }>;
}) {
  const { hz: hzParam } = await searchParams;
  const { rol } = await requireRol();
  const puedeSolicitar = tienePermiso(rol, "solicitudes:crear");

  const fy = await obtenerFySeleccionado();
  const supabase = await createSupabaseServerClient();

  const [filas, provisiones, preregistrado, fechaSap] = await Promise.all([
    obtenerFondos(supabase, fy),
    supabase
      .from("solicitudes")
      .select("id, estado, id_oi, id_ceco, trimestre")
      .eq("tipo", "provision")
      .eq("fy", fy)
      .neq("estado", "rechazada"),
    obtenerPreregistrado(supabase, fy),
    obtenerFechaDatosSap(supabase),
  ]);
  const todas = agruparPorUnidad(filas);

  // Grupos por Hunting Zone, con su conteo, para el filtro.
  const conteoGrupos = new Map<string, number>();
  for (const u of todas) conteoGrupos.set(grupoDe(u), (conteoGrupos.get(grupoDe(u)) ?? 0) + 1);
  const grupos = [...conteoGrupos.keys()].sort((a, b) => {
    // Las HZ primero (alfabético); CeCo y "sin HZ" al final.
    const peso = (g: string): number =>
      g === "Centros de Costo" ? 1 : g === "Sin Hunting Zone" ? 2 : 0;
    return peso(a) - peso(b) || a.localeCompare(b, "es");
  });
  const grupoActivo = grupos.find((g) => slugGrupo(g) === hzParam) ?? null;
  const unidades = grupoActivo ? todas.filter((u) => grupoDe(u) === grupoActivo) : todas;
  const secciones = grupos
    .filter((g) => !grupoActivo || g === grupoActivo)
    .map((g) => ({ grupo: g, unidades: unidades.filter((u) => grupoDe(u) === g) }));

  // Provisiones ya declaradas por unidad y trimestre: evita pedir dos veces.
  const provisionPedida = new Map(
    (provisiones.data ?? []).map((p) => [
      `${p.id_oi ?? p.id_ceco}:${p.trimestre}`,
      { id: p.id as string, estado: p.estado as string },
    ]),
  );

  const unidadDe = (u: UnidadFondos): string => u.idOi ?? u.idCeco ?? "";
  const preregistradoDe = (u: UnidadFondos, mes: number): number =>
    preregistrado.data.get(clavePreregistrado(unidadDe(u), mes))?.usd ?? 0;

  const total = (f: (u: UnidadFondos) => number): number => unidades.reduce((s, u) => s + f(u), 0);
  let totalPreregistrado = 0;
  let vencidasSinCruzar = 0;
  for (const p of preregistrado.data.values()) {
    totalPreregistrado += p.usd;
    vencidasSinCruzar += p.facturasVencidas;
  }

  const sinPresupuesto = unidades.every((u) => u.plan + u.suplementos === 0);
  const mesActual = new Date().getMonth() + 1;

  return (
    <main className="mx-auto w-full max-w-[1300px] px-5 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="ui-eyebrow">Gestión de presupuesto</p>
          <h1 className="ui-title">Fondos disponibles</h1>
          <p className="ui-lead">
            Finanzas <strong>habilita el plan mes a mes</strong> y{" "}
            <strong>retira lo no usado al cerrar cada trimestre</strong>. Lo que sobra de un mes
            pasa al siguiente dentro del trimestre; al cierre se retira, salvo lo declarado como
            provisión.
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {fechaSap
              ? `Real según SAP: datos al ${new Date(fechaSap).toLocaleDateString("es-VE", {
                  dateStyle: "long",
                })}.`
              : "Todavía no hay cargas de SAP completadas."}
          </p>
        </div>

        <span className="rounded-md bg-[var(--navy)] px-3 py-1.5 text-sm font-semibold text-white">
          FY {fyEtiqueta(fy)}
        </span>
      </header>

      {grupos.length > 1 && (
        <nav
          aria-label="Filtrar por Hunting Zone"
          className="mt-6 flex flex-wrap items-center gap-2"
        >
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Hunting Zone
          </span>
          <Link href="/fondos" aria-current={grupoActivo ? undefined : "page"} className="ui-chip">
            Todas <span className="ui-chip-n">{todas.length}</span>
          </Link>
          {grupos.map((g) => (
            <Link
              key={g}
              href={`/fondos?hz=${encodeURIComponent(slugGrupo(g))}`}
              aria-current={g === grupoActivo ? "page" : undefined}
              className="ui-chip"
            >
              {g} <span className="ui-chip-n">{conteoGrupos.get(g)}</span>
            </Link>
          ))}
        </nav>
      )}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="ui-kpi">
          <h2 className="kl">Disponible (mes en curso)</h2>
          <p className="kv">{moneda.format(total((u) => u.disponibleHoy))}</p>
        </article>
        <article className="ui-kpi">
          <h2 className="kl">Por habilitar</h2>
          <p className="kv">{moneda.format(total((u) => u.porHabilitar))}</p>
        </article>
        <article className="ui-kpi">
          <h2 className="kl">Real del año (SAP)</h2>
          <p className="kv">{moneda.format(total((u) => u.real))}</p>
        </article>
        <article className="ui-kpi">
          <h2 className="kl">Retirado en cierres</h2>
          <p
            className="kv"
            style={{ color: total((u) => u.retirado) > 0 ? "var(--bad)" : undefined }}
          >
            {moneda.format(total((u) => u.retirado))}
          </p>
        </article>
        <article className="ui-kpi">
          <h2 className="kl">Suplementos</h2>
          <p className="kv">{moneda.format(total((u) => u.suplementos))}</p>
        </article>
        <article className="ui-kpi">
          <h2 className="kl">Devoluciones</h2>
          <p className="kv">{moneda.format(total((u) => u.devoluciones))}</p>
        </article>
        <article className="ui-kpi">
          <h2 className="kl">Provisiones vigentes</h2>
          <p className="kv">{moneda.format(total((u) => u.provisionVigente))}</p>
        </article>
        <article className="ui-kpi">
          <h2 className="kl">Pre-registrado</h2>
          <p className="kv">{moneda.format(totalPreregistrado)}</p>
          <Link
            href="/facturas?estado=sin_cruzar"
            className="mt-1 block text-[11px] font-semibold text-[var(--blue)] underline"
          >
            Ver facturas sin cruzar
            {vencidasSinCruzar > 0 && ` · ${vencidasSinCruzar} con más de 60 días`}
          </Link>
        </article>
      </section>

      <details className="mt-6 rounded-md border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--ink-soft)]">
        <summary className="cursor-pointer font-semibold text-[var(--ink)]">
          Glosario: cómo leer esta pantalla
        </summary>
        <p className="mt-2">
          Los términos son los del reporte BW de Control Presupuestario de Planificación Financiera.{" "}
          <strong>Solo el Real cuenta como gasto</strong> (es lo que ve el dashboard); el resto es
          la cuenta de fondos del área, para saber cuánto hay disponible y qué pasó con el dinero.
        </p>
        <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-[var(--ink)]">Plan</dt>
            <dd>Lo asignado a la orden en el ejercicio. Finanzas lo habilita mes a mes.</dd>
          </div>
          <div>
            <dt className="font-semibold text-[var(--ink)]">Suplementos</dt>
            <dd>Extra plan aprobado + fondos que entran por reclasificación.</dd>
          </div>
          <div>
            <dt className="font-semibold text-[var(--ink)]">Devoluciones</dt>
            <dd>Ahorros declarados + fondos que salen por reclasificación.</dd>
          </div>
          <div>
            <dt className="font-semibold text-[var(--ink)]">Real</dt>
            <dd>Facturas contabilizadas en SAP. Lo único que cuenta como gasto.</dd>
          </div>
          <div>
            <dt className="font-semibold text-[var(--ink)]">Disponible</dt>
            <dd>
              Lo que queda para imputar en el mes en curso: plan + suplementos − devoluciones −
              real, acumulado dentro del trimestre.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-[var(--ink)]">Retirado</dt>
            <dd>Lo que finanzas retiró al cerrar el trimestre porque no se usó.</dd>
          </div>
          <div>
            <dt className="font-semibold text-[var(--ink)]">Provisión</dt>
            <dd>
              Servicio ya recibido cuya factura no llegó. Declarada y aprobada, ese monto no se
              retira: pasa al trimestre siguiente.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-[var(--ink)]">Ahorro</dt>
            <dd>Fondos que no se usarán: se devuelven antes del cierre.</dd>
          </div>
          <div>
            <dt className="font-semibold text-[var(--ink)]">Reclasificación</dt>
            <dd>
              Mover fondos de una orden a otra: devolución en el origen, suplemento en el destino.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-[var(--ink)]">Pre-registrado</dt>
            <dd>
              Facturas registradas en la app que SAP todavía no trajo. Informativo: no se descuenta
              del Disponible y desaparece cuando la factura cruza.
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-[var(--muted)]">
          La app no carga el Comprometido de SAP (pedidos sin factura), así que tampoco muestra el
          Asignado. Para esos dos, el reporte BW sigue siendo la referencia.
        </p>
      </details>

      {(provisiones.error || preregistrado.error) && (
        <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          No se pudo cargar toda la información: {provisiones.error?.message ?? preregistrado.error}
        </p>
      )}

      {sinPresupuesto && (
        <p className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Todavía no hay presupuesto cargado para {fyEtiqueta(fy)}, así que no hay fondos que
          habilitar. Puedes{" "}
          <Link href="/presupuestos" className="font-semibold underline">
            cargar el Plan
          </Link>{" "}
          o{" "}
          <Link href="/solicitudes/nueva?tipo=extra_plan" className="font-semibold underline">
            armar una solicitud de extra plan
          </Link>
          .
        </p>
      )}

      {unidades.length === 0 ? (
        <p className="ui-card mt-8 px-4 py-10 text-center text-sm text-[var(--muted)]">
          No hay movimiento ni presupuesto en {fyEtiqueta(fy)}.
        </p>
      ) : (
        secciones.map(({ grupo, unidades: delGrupo }) => (
          <section key={grupo} className="mt-8">
            <h2 className="flex flex-wrap items-baseline gap-x-3 border-b border-[var(--line)] pb-2 text-lg font-bold text-[var(--navy)]">
              {grupo}
              <span className="text-sm font-normal text-[var(--muted)]">
                {delGrupo.length} {delGrupo.length === 1 ? "unidad" : "unidades"} · disponible{" "}
                {moneda.format(delGrupo.reduce((s, u) => s + u.disponibleHoy, 0))}
              </span>
            </h2>

            <div className="mt-4 space-y-4">
              {delGrupo.map((u) => {
                const unidadParam = u.idOi ? `oi=${u.idOi}` : `ceco=${u.idCeco}`;
                const hayMesEnCurso = u.trimestres.some((t) => t.estado === "actual");

                return (
                  <article key={u.clave} className="ui-card overflow-hidden">
                    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
                      <div>
                        <p className="font-mono text-sm font-bold text-[var(--navy)]">{u.codigo}</p>
                        <p className="text-xs text-[var(--muted)]">
                          {u.huntingZone ??
                            (u.idCeco ? "Centro de Costo" : "Sin Hunting Zone asociada")}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-5 text-right">
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                            Disponible hoy
                          </p>
                          <p
                            className="text-lg font-extrabold tabular-nums"
                            style={{ color: u.disponibleHoy < 0 ? "var(--bad)" : "var(--ink)" }}
                          >
                            {moneda.format(u.disponibleHoy)}
                          </p>
                        </div>
                        {u.retirado > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                              Retirado
                            </p>
                            <p className="text-lg font-extrabold tabular-nums text-[var(--bad)]">
                              {moneda.format(u.retirado)}
                            </p>
                          </div>
                        )}
                      </div>
                    </header>

                    <div className="overflow-x-auto">
                      <table className="ui-table min-w-[64rem] text-xs">
                        <thead>
                          <tr>
                            <th>Mes</th>
                            <th className="r">Plan</th>
                            <th className="r">Suplementos</th>
                            <th className="r">Devoluciones</th>
                            <th className="r">Real (SAP)</th>
                            <th className="r">Disponible</th>
                            <th className="r">Pre-registrado</th>
                          </tr>
                        </thead>
                        {u.trimestres.map((t) => {
                          const provision = provisionPedida.get(`${unidadDe(u)}:${t.trimestre}`);
                          // La provisión se declara sobre el trimestre en curso o
                          // sobre uno cerrado al que se le retiró algo. La del Q4
                          // pasa al Q1 del año fiscal siguiente.
                          const puedeProvisionar =
                            !provision &&
                            puedeSolicitar &&
                            (t.estado === "actual" || (t.estado === "cerrado" && t.retirado > 0));
                          const montoProvision = Math.max(
                            t.estado === "actual" ? t.disponibleFinal : t.retirado,
                            0,
                          );

                          return (
                            <tbody key={t.trimestre}>
                              <tr className="bg-[var(--line-soft)]">
                                <td colSpan={7} className="font-semibold text-[var(--navy)]">
                                  {etiquetaTrimestre(t.trimestre)}
                                  <span className="ml-2 text-[10px] font-normal uppercase text-[var(--muted)]">
                                    {ETIQUETA_ESTADO_MES[t.estado]}
                                  </span>
                                  {t.provisionRecibida > 0 && (
                                    <span className="ml-3 font-normal text-[var(--ok)]">
                                      + {moneda.format(t.provisionRecibida)} de provisión recibida
                                    </span>
                                  )}
                                </td>
                              </tr>
                              {t.meses.map((m) => (
                                <tr
                                  key={m.mes}
                                  className={
                                    m.estado_mes === "actual"
                                      ? "bg-[rgba(46,117,182,0.06)]"
                                      : m.estado_mes === "futuro"
                                        ? "text-[var(--muted)]"
                                        : undefined
                                  }
                                >
                                  <td className="whitespace-nowrap">
                                    <span
                                      className={
                                        m.estado_mes === "actual"
                                          ? "font-bold text-[var(--navy)]"
                                          : ""
                                      }
                                    >
                                      {nombreMes(m.mes)}
                                    </span>
                                    <span className="ml-2 text-[10px] uppercase text-[var(--muted)]">
                                      {ETIQUETA_ESTADO_MES[m.estado_mes]}
                                    </span>
                                  </td>
                                  <td className="r">{monto(m.plan)}</td>
                                  <td className="r">{monto(m.suplementos)}</td>
                                  <td className="r">{monto(m.devoluciones)}</td>
                                  <td className="r">{monto(m.monto_real)}</td>
                                  <td className="r font-semibold">
                                    {m.estado_mes === "futuro" ? (
                                      "—"
                                    ) : (
                                      <span
                                        style={{
                                          color: m.disponible < 0 ? "var(--bad)" : "var(--ink)",
                                        }}
                                      >
                                        {moneda.format(m.disponible)}
                                      </span>
                                    )}
                                  </td>
                                  <td className="r">{monto(preregistradoDe(u, m.mes))}</td>
                                </tr>
                              ))}
                              {t.estado !== "futuro" && (
                                <tr>
                                  <td colSpan={7} className="text-[11px] text-[var(--ink-soft)]">
                                    {t.estado === "cerrado" ? (
                                      <>
                                        Cierre: sobraron{" "}
                                        {moneda.format(Math.max(t.disponibleFinal, 0))}
                                        {t.provisionSiguiente > 0 &&
                                          ` · ${moneda.format(t.provisionSiguiente)} provisionados pasan al trimestre siguiente`}
                                        {" · "}
                                        <span
                                          className={
                                            t.retirado > 0 ? "font-semibold text-[var(--bad)]" : ""
                                          }
                                        >
                                          retirado {moneda.format(t.retirado)}
                                        </span>
                                      </>
                                    ) : (
                                      "Al cerrar el trimestre se retira lo que quede, salvo lo declarado como provisión."
                                    )}
                                    {provision && (
                                      <Link
                                        href={`/solicitudes/${provision.id}`}
                                        className="ml-2 rounded-full bg-[rgba(46,117,182,0.1)] px-2 py-0.5 text-[10px] font-semibold text-[var(--blue)]"
                                      >
                                        provisión {provision.estado}
                                        {provision.estado === "aprobada" &&
                                          t.estado === "actual" &&
                                          " · se aplica al cierre"}
                                      </Link>
                                    )}
                                    {puedeProvisionar && (
                                      <Link
                                        href={`/solicitudes/nueva?tipo=provision&${unidadParam}&fy=${fy}&trimestre=${t.trimestre}&monto=${montoProvision.toFixed(2)}`}
                                        className="ml-2 font-semibold text-[var(--blue)] underline"
                                      >
                                        Declarar provisión
                                      </Link>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          );
                        })}
                      </table>
                    </div>

                    {puedeSolicitar && (
                      <footer className="flex flex-wrap justify-end gap-x-5 gap-y-1 border-t border-[var(--line-soft)] px-4 py-2 text-xs font-semibold text-[var(--blue)]">
                        {hayMesEnCurso && (
                          <Link
                            href={`/solicitudes/nueva?tipo=ahorro&${unidadParam}&fy=${fy}&mes=${mesActual}`}
                            className="hover:underline"
                          >
                            Declarar ahorro
                          </Link>
                        )}
                        <Link
                          href={`/solicitudes/nueva?tipo=reclasificacion&${unidadParam}&fy=${fy}&mes=${mesActual}`}
                          className="hover:underline"
                        >
                          Reclasificar a otra orden
                        </Link>
                        <Link
                          href={`/solicitudes/nueva?tipo=extra_plan&${unidadParam}&fy=${fy}`}
                          className="hover:underline"
                        >
                          Solicitar extra plan →
                        </Link>
                      </footer>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ))
      )}
    </main>
  );
}
