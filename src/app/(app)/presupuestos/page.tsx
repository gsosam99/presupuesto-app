import { DetallePlan } from "@/components/presupuestos/DetallePlan";
import { SubidaPresupuesto } from "@/components/presupuestos/SubidaPresupuesto";
import { PestanasNav } from "@/components/ui/PestanasNav";
import { obtenerRol } from "@/lib/auth";
import { fyEtiqueta, nombreMes } from "@/lib/fiscal";
import { obtenerFySeleccionado } from "@/lib/fiscal-seleccionado";
import { moneda } from "@/lib/format";
import { tienePermiso } from "@/lib/permisos";
import { obtenerLineasPresupuesto } from "@/lib/presupuesto/lineas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Presupuestos — IENN Gastos App" };
export const dynamic = "force-dynamic";

export default async function PresupuestosPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string }>;
}) {
  const vista = (await searchParams).vista === "detalle" ? "detalle" : "resumen";
  const supabase = await createSupabaseServerClient();
  const puedeCargar = tienePermiso(await obtenerRol(), "presupuestos:cargar");
  const fy = await obtenerFySeleccionado();

  // Una sola lectura de las líneas alimenta las dos pestañas, e incluye las
  // presupuestadas por CeCo (v_presupuesto_oi_mes solo ve órdenes internas).
  const { data: lineas, error } = await obtenerLineasPresupuesto(supabase, fy);

  // Consolidado por mes: es la forma en que se va a comparar contra el real.
  const porPeriodo = new Map<number, { fy: number; mes: number; plan: number; extra: number }>();
  for (const l of lineas) {
    const previo = porPeriodo.get(l.mes) ?? { fy, mes: l.mes, plan: 0, extra: 0 };
    if (l.tipo === "plan") previo.plan += l.monto;
    else previo.extra += l.monto;
    porPeriodo.set(l.mes, previo);
  }

  const periodos = [...porPeriodo.values()].sort(
    (a, b) => a.fy - b.fy || ((a.mes + 2) % 12) - ((b.mes + 2) % 12),
  );

  const totalPlan = periodos.reduce((s, p) => s + p.plan, 0);
  const totalExtra = periodos.reduce((s, p) => s + p.extra, 0);

  return (
    <main className="mx-auto w-full max-w-[1300px] px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Presupuestos</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Carga el Plan base y los Extra Plan. Cada línea apunta a una Orden Interna (o a un Centro
          de Costo, si se presupuesta sin orden) y el sistema deduce el resto cruzando contra las
          maestras. Si el archivo trae la columna <strong>Macroactividad</strong>, se usa para
          sugerir el Motivo al clasificar los gastos de ese año fiscal. Antes de registrar nada se
          muestra una vista previa con los totales por orden.
        </p>
      </header>

      {error && (
        <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          No se pudo cargar el presupuesto: {error}
        </p>
      )}

      <PestanasNav
        etiqueta="Vistas de presupuesto"
        activa={vista === "detalle" ? "/presupuestos?vista=detalle" : "/presupuestos"}
        pestanas={[
          { href: "/presupuestos", etiqueta: "Resumen" },
          { href: "/presupuestos?vista=detalle", etiqueta: `Detalle del plan (${lineas.length})` },
        ]}
        className="mt-6"
      />

      {vista === "detalle" ? (
        <section className="mt-6">
          <DetallePlan fy={fy} lineas={lineas} />
        </section>
      ) : (
        <>
          {puedeCargar && (
            <section className="mt-8">
              <SubidaPresupuesto />
            </section>
          )}

          <section className="mt-12">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Presupuesto cargado
            </h2>

            {periodos.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">Todavía no hay presupuesto cargado.</p>
            ) : (
              <>
                <dl className="mt-4 flex flex-wrap gap-8">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Plan base</dt>
                    <dd className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">
                      {moneda.format(totalPlan)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Extra Plan</dt>
                    <dd className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">
                      {moneda.format(totalExtra)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Total</dt>
                    <dd className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">
                      {moneda.format(totalPlan + totalExtra)}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <table className="w-full min-w-[36rem] text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-4 py-2 font-medium">Año fiscal</th>
                        <th className="px-4 py-2 font-medium">Mes</th>
                        <th className="px-4 py-2 text-right font-medium">Plan base</th>
                        <th className="px-4 py-2 text-right font-medium">Extra Plan</th>
                        <th className="px-4 py-2 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {periodos.map((p) => (
                        <tr key={`${p.fy}-${p.mes}`}>
                          <td className="px-4 py-2 text-slate-600">{fyEtiqueta(p.fy)}</td>
                          <td className="px-4 py-2 text-slate-900">{nombreMes(p.mes)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                            {moneda.format(p.plan)}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                            {moneda.format(p.extra)}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-900">
                            {moneda.format(p.plan + p.extra)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </main>
  );
}
