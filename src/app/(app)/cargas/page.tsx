import { SubidaSap } from "@/components/cargas/SubidaSap";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Cargas — IENN Gastos App" };
export const dynamic = "force-dynamic";

interface FilaCarga {
  id: string;
  tipo: string;
  nombre_archivo: string;
  estado: string;
  filas_leidas: number;
  filas_insertadas: number;
  filas_duplicadas: number;
  filas_rechazadas: number;
  mensaje: string | null;
  created_at: string;
}

const ETIQUETA_TIPO: Record<string, string> = {
  sap_ceco: "SAP · Centro de Costo",
  sap_oi: "SAP · Orden Interna",
  presupuesto_plan: "Presupuesto · Plan",
  presupuesto_extra_plan: "Presupuesto · Extra Plan",
  maestras: "Maestras / histórico",
};

export default async function CargasPage() {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("cargas")
    .select(
      "id, tipo, nombre_archivo, estado, filas_leidas, filas_insertadas, filas_duplicadas, filas_rechazadas, mensaje, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(15);

  const cargas = (data ?? []) as unknown as FilaCarga[];

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Carga de reportes SAP</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Arrastra los exportables mensuales de SAP (Centro de Costo y Orden Interna). El
          sistema descarta los subtotales, cruza las órdenes internas contra las maestras,
          infiere la Hunting Zone de los gastos huérfanos con las etiquetas del texto y
          predice Fase, Motivo y Detalle a partir del histórico.
        </p>
      </header>

      <section className="mt-8">
        <SubidaSap />
      </section>

      <section className="mt-12">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Cargas recientes
        </h2>

        {error && (
          <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            No se pudo leer el historial: {error.message}
          </p>
        )}

        {cargas.length === 0 && !error && (
          <p className="mt-4 text-sm text-slate-500">Todavía no hay cargas registradas.</p>
        )}

        {cargas.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2 font-medium">Archivo</th>
                  <th className="px-4 py-2 font-medium">Tipo</th>
                  <th className="px-4 py-2 text-right font-medium">Leídas</th>
                  <th className="px-4 py-2 text-right font-medium">Insertadas</th>
                  <th className="px-4 py-2 text-right font-medium">Duplicadas</th>
                  <th className="px-4 py-2 text-right font-medium">Descartadas</th>
                  <th className="px-4 py-2 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cargas.map((c) => (
                  <tr key={c.id}>
                    <td className="max-w-[16rem] truncate px-4 py-2 text-slate-900">
                      {c.nombre_archivo}
                      {c.mensaje && (
                        <span className="mt-0.5 block text-xs text-amber-700">
                          {c.mensaje}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {ETIQUETA_TIPO[c.tipo] ?? c.tipo}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                      {c.filas_leidas}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-900">
                      {c.filas_insertadas}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                      {c.filas_duplicadas}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                      {c.filas_rechazadas}
                    </td>
                    <td className="px-4 py-2 text-slate-500">
                      {new Date(c.created_at).toLocaleString("es-VE", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
