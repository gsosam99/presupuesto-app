import {
  FormularioIngreso,
  type OpcionHz,
  type SugerenciasIngreso,
} from "@/components/ingresos/FormularioIngreso";
import { TablaIngresos, type FilaIngreso } from "@/components/ingresos/TablaIngresos";
import { fyActual, fyEtiqueta, MESES_FY, nombreMes } from "@/lib/fiscal";
import { obtenerFySeleccionado } from "@/lib/fiscal-seleccionado";
import { moneda } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Ingresos — IENN Gastos App" };
export const dynamic = "force-dynamic";

/** El mes en curso si cae dentro del FY elegido; si no, el primero del ciclo. */
function mesInicialDelFy(fy: number, hoy = new Date()): number {
  return fyActual(hoy) === fy ? hoy.getMonth() + 1 : MESES_FY[0];
}

export default async function IngresosPage() {
  const supabase = await createSupabaseServerClient();
  const fy = await obtenerFySeleccionado();

  const [hzs, tax, ingresos] = await Promise.all([
    supabase
      .from("hunting_zones")
      .select("id, nombre")
      .eq("activo", true)
      .order("orden_display"),
    supabase.from("v_valores_taxonomia").select("campo, valor").order("usos", { ascending: false }),
    supabase
      .from("ingresos")
      .select("id, mes, id_hunting_zone, concepto, fase, motivo, detalle, monto, nota")
      .eq("fy", fy)
      .order("mes")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const huntingZones = (hzs.data ?? []) as unknown as OpcionHz[];
  const filas = ((ingresos.data ?? []) as unknown as FilaIngreso[]).map((f) => ({
    ...f,
    monto: Number(f.monto),
  }));

  const valores = (tax.data ?? []) as Array<{ campo: string; valor: string }>;
  const porCampo = (campo: string): string[] =>
    valores.filter((v) => v.campo === campo).map((v) => v.valor);
  const sugerencias: SugerenciasIngreso = {
    concepto: porCampo("concepto"),
    fase: porCampo("fase"),
    motivo: porCampo("motivo"),
    detalle: porCampo("detalle"),
  };

  const totalFy = filas.reduce((s, f) => s + f.monto, 0);
  const porMes = new Map<number, number>();
  for (const f of filas) porMes.set(f.mes, (porMes.get(f.mes) ?? 0) + f.monto);

  const mesActual = mesInicialDelFy(fy);
  const totalMes = porMes.get(mesActual) ?? 0;

  const errorCarga = hzs.error ?? tax.error ?? ingresos.error ?? null;

  return (
    <main className="mx-auto w-full max-w-[1240px] px-5 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="ui-eyebrow">Gestión de presupuesto</p>
          <h1 className="ui-title">Ingresos</h1>
          <p className="ui-lead">
            Lo que efectivamente cobraron los proyectos, mes a mes. A diferencia de los
            gastos, un ingreso no cuelga de un Centro de Costo ni de una Orden Interna: se
            imputa directo a la Hunting Zone. Sólo se registra lo real — los ingresos no se
            presupuestan.
          </p>
        </div>
        <span className="rounded-md bg-[var(--navy)] px-3 py-1.5 text-sm font-semibold text-white">
          FY {fyEtiqueta(fy)}
        </span>
      </header>

      {errorCarga && (
        <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          No se pudo cargar toda la información: {errorCarga.message}
        </p>
      )}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="ui-kpi">
          <div className="kl">Ingresos del año</div>
          <div className="kv">{moneda.format(totalFy)}</div>
        </div>
        <div className="ui-kpi">
          <div className="kl">{nombreMes(mesActual)}</div>
          <div className="kv">{moneda.format(totalMes)}</div>
        </div>
        <div className="ui-kpi">
          <div className="kl">Registros</div>
          <div className="kv">{filas.length}</div>
        </div>
        <div className="ui-kpi">
          <div className="kl">Meses con ingreso</div>
          <div className="kv">{porMes.size}</div>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="ui-section-title">Registrar un ingreso</h2>
        <div className="mt-3">
          <FormularioIngreso
            fy={fy}
            huntingZones={huntingZones}
            sugerencias={sugerencias}
            mesInicial={mesActual}
          />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="ui-section-title">Ingresos del año</h2>
        <div className="mb-3 mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
          {MESES_FY.filter((m) => porMes.has(m)).map((m) => (
            <span key={m}>
              {nombreMes(m)}: <strong className="text-[var(--ink)]">{moneda.format(porMes.get(m) ?? 0)}</strong>
            </span>
          ))}
        </div>
        <TablaIngresos filas={filas} huntingZones={huntingZones} sugerencias={sugerencias} />
      </section>
    </main>
  );
}
