import {
  TablaArchivados,
  type GastoArchivado,
} from "@/components/archivados/TablaArchivados";
import { obtenerFySeleccionado } from "@/lib/fiscal-seleccionado";
import { moneda } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Archivados — IENN Gastos App" };
export const dynamic = "force-dynamic";

export default async function ArchivadosPage() {
  const supabase = await createSupabaseServerClient();
  const fy = await obtenerFySeleccionado();

  const { data, error } = await supabase
    .from("v_gastos_enriquecidos")
    .select(
      "id, fecha_documento, factura, proveedor, proveedor_codigo, texto_referencia, grupo_clase_coste, monto_real, ceco_codigo_raw, oi_codigo_raw, hunting_zone",
    )
    .eq("estado_revision", "excluido")
    .eq("fy", fy)
    .order("fecha_documento", { ascending: false })
    .limit(1000);

  const gastos = (data ?? []) as unknown as GastoArchivado[];
  const monto = gastos.reduce((s, g) => s + Number(g.monto_real), 0);

  return (
    <main className="mx-auto w-full max-w-[1240px] px-5 py-8">
      <header>
        <p className="ui-eyebrow">Papelera</p>
        <h1 className="ui-title">Gastos archivados</h1>
        <p className="ui-lead">
          Gastos que SAP trae en cada reporte pero que no entran en el control. No se borran
          nunca: quedan acá, fuera de todos los KPIs, y puedes devolverlos al triaje cuando
          haga falta. Al recargar el mismo reporte, la deduplicación evita que vuelvan a
          entrar.
        </p>
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <article className="ui-kpi">
          <h2 className="kl">Gastos archivados</h2>
          <p className="kv">{gastos.length}</p>
        </article>
        <article className="ui-kpi">
          <h2 className="kl">Monto fuera del control</h2>
          <p className="kv">{moneda.format(monto)}</p>
        </article>
      </section>

      {error && (
        <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-[var(--bad)]">
          No se pudo leer el archivo: {error.message}
        </p>
      )}

      <section className="mt-8">
        <TablaArchivados gastos={gastos} />
      </section>
    </main>
  );
}
