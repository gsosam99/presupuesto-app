import { SubidaPresupuesto } from "@/components/presupuestos/SubidaPresupuesto";
import { fyEtiqueta, nombreMes } from "@/lib/fiscal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Presupuestos — IENN Gastos App" };
export const dynamic = "force-dynamic";

interface FilaPresupuesto {
  fy: number;
  mes: number;
  monto_plan: number | null;
  monto_suplemento_extra_plan: number | null;
  monto_total: number;
}

const moneda = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default async function PresupuestosPage() {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("v_presupuesto_oi_mes")
    .select("fy, mes, monto_plan, monto_suplemento_extra_plan, monto_total");

  const filas = (data ?? []) as unknown as FilaPresupuesto[];

  // Consolidado por FY y mes: es la forma en que se va a comparar contra el real.
  const porPeriodo = new Map<string, { fy: number; mes: number; plan: number; extra: number }>();
  for (const f of filas) {
    const clave = `${f.fy}-${f.mes}`;
    const previo = porPeriodo.get(clave) ?? { fy: f.fy, mes: f.mes, plan: 0, extra: 0 };
    porPeriodo.set(clave, {
      ...previo,
      plan: previo.plan + Number(f.monto_plan ?? 0),
      extra: previo.extra + Number(f.monto_suplemento_extra_plan ?? 0),
    });
  }

  const periodos = [...porPeriodo.values()].sort(
    (a, b) => a.fy - b.fy || ((a.mes + 2) % 12) - ((b.mes + 2) % 12),
  );

  const totalPlan = periodos.reduce((s, p) => s + p.plan, 0);
  const totalExtra = periodos.reduce((s, p) => s + p.extra, 0);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Presupuestos</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Cargá el Plan base y los Extra Plan. Cada línea apunta a una Orden Interna, y el
          sistema deduce solo a qué Centro de Costo y Hunting Zone pertenece cruzando
          contra la maestra. Si una OI del archivo no existe, esa línea se rechaza con el
          motivo en vez de cargarse a ciegas.
        </p>
      </header>

      <section className="mt-8">
        <SubidaPresupuesto />
      </section>

      <section className="mt-12">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Presupuesto cargado
        </h2>

        {periodos.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            Todavía no hay presupuesto cargado.
          </p>
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
    </main>
  );
}
