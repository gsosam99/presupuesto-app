import { CargaMasivaFacturas } from "@/components/facturas/CargaMasivaFacturas";
import {
  FormularioFactura,
  type OpcionOi,
  type Sugerencias,
} from "@/components/facturas/FormularioFactura";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Facturas — IENN Gastos App" };
export const dynamic = "force-dynamic";

interface FilaConciliacion {
  id_factura_preregistrada: string;
  numero_factura: string;
  proveedor_codigo: string | null;
  fecha_factura: string | null;
  monto_estimado: number | null;
  moneda: string;
  posiciones_sap: number;
  monto_real_sap: number;
  desvio_usd: number | null;
  conciliada: boolean;
}

const moneda = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default async function FacturasPage() {
  const supabase = await createSupabaseServerClient();

  const [ois, hzs, tax, conciliacion] = await Promise.all([
    supabase
      .from("ordenes_internas")
      .select("id, codigo_oi, nombre, id_hunting_zone")
      .eq("activo", true)
      .order("codigo_oi"),
    supabase
      .from("hunting_zones")
      .select("id, nombre")
      .eq("activo", true)
      .order("orden_display"),
    supabase.from("v_valores_taxonomia").select("campo, valor").order("usos", { ascending: false }),
    supabase
      .from("v_conciliacion_facturas")
      .select(
        "id_factura_preregistrada, numero_factura, proveedor_codigo, fecha_factura, monto_estimado, moneda, posiciones_sap, monto_real_sap, desvio_usd, conciliada",
      )
      .order("fecha_factura", { ascending: false, nullsFirst: false })
      .limit(50),
  ]);

  const hzPorId = new Map(
    (hzs.data ?? []).map((h) => [h.id as string, h.nombre as string]),
  );

  const ordenesInternas: OpcionOi[] = (ois.data ?? []).map((o) => ({
    id: o.id as string,
    codigo: o.codigo_oi as string,
    nombre: (o.nombre as string | null) ?? null,
    idHuntingZone: (o.id_hunting_zone as string | null) ?? null,
    huntingZone: o.id_hunting_zone
      ? (hzPorId.get(o.id_hunting_zone as string) ?? null)
      : null,
  }));

  const valores = (tax.data ?? []) as unknown as Array<{ campo: string; valor: string }>;
  const sugerencias: Sugerencias = {
    fase: valores.filter((v) => v.campo === "fase").map((v) => v.valor),
    motivo: valores.filter((v) => v.campo === "motivo").map((v) => v.valor),
    detalle: valores.filter((v) => v.campo === "detalle").map((v) => v.valor),
  };

  const filas = (conciliacion.data ?? []) as unknown as FilaConciliacion[];

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Pre-registro de facturas</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Registrá cada factura a medida que llega a finanzas. Cuando cargues el reporte
          mensual de SAP, el cruce por número de factura le aplica al gasto la Orden
          Interna y la taxonomía que definiste acá, sin pasar por el triaje. Una misma
          factura puede cruzar con varias posiciones de SAP.
        </p>
      </header>

      <section className="mt-8">
        <FormularioFactura ordenesInternas={ordenesInternas} sugerencias={sugerencias} />
      </section>

      <section className="mt-6">
        <CargaMasivaFacturas />
      </section>

      <section className="mt-12">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Facturas registradas
        </h2>

        {filas.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            Todavía no hay facturas pre-registradas.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2 font-medium">Factura</th>
                  <th className="px-4 py-2 font-medium">Cta. proveedor</th>
                  <th className="px-4 py-2 font-medium">Fecha</th>
                  <th className="px-4 py-2 text-right font-medium">Monto declarado</th>
                  <th className="px-4 py-2 text-right font-medium">Posiciones SAP</th>
                  <th className="px-4 py-2 text-right font-medium">Real SAP</th>
                  <th className="px-4 py-2 text-right font-medium">Desvío</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filas.map((f) => (
                  <tr key={f.id_factura_preregistrada}>
                    <td className="px-4 py-2 font-mono text-slate-900">
                      {f.numero_factura}
                      {!f.conciliada && (
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 font-sans text-xs text-slate-600">
                          sin cruzar
                        </span>
                      )}
                    </td>
                    <td className="max-w-[14rem] truncate px-4 py-2 text-slate-600">
                      {f.proveedor_codigo ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{f.fecha_factura ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                      {f.monto_estimado === null
                        ? "—"
                        : `${moneda.format(f.monto_estimado)} ${f.moneda}`}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                      {f.posiciones_sap}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-900">
                      {moneda.format(f.monto_real_sap)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {f.desvio_usd === null ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <span
                          className={
                            Math.abs(f.desvio_usd) < 0.01
                              ? "text-slate-500"
                              : "font-medium text-amber-700"
                          }
                        >
                          {moneda.format(f.desvio_usd)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs text-slate-500">
          El desvío solo se calcula cuando el monto declarado ya estaba en USD. Si lo
          cargaste en Bs no se compara, porque SAP convierte a la tasa BCV del día de la
          factura y nunca daría exacto.
        </p>
      </section>
    </main>
  );
}
