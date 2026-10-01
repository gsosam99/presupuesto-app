import { PestanasTriaje } from "@/components/triaje/PestanasTriaje";
import { TablaTriaje, type GastoPendiente } from "@/components/triaje/TablaTriaje";
import { requireRol } from "@/lib/auth";
import { obtenerFySeleccionado } from "@/lib/fiscal-seleccionado";
import { moneda } from "@/lib/format";
import { tienePermiso } from "@/lib/permisos";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerCatalogosTriaje } from "@/lib/triaje/catalogos";

export const metadata = { title: "Triaje — IENN Gastos App" };
export const dynamic = "force-dynamic";

/** Cuántos pendientes se traen por lote. */
const TAMANO_LOTE = 500;

export default async function TriajePage() {
  const { rol } = await requireRol();
  const puedeEditar = tienePermiso(rol, "triaje:editar");
  const puedeCargar = tienePermiso(rol, "cargas:sap");

  const supabase = await createSupabaseServerClient();
  const fy = await obtenerFySeleccionado();

  const [pendientes, conteo, catalogos] = await Promise.all([
    supabase
      .from("v_gastos_cruce")
      .select(
        "id, fecha_documento, factura, proveedor, proveedor_codigo, texto_referencia, grupo_clase_coste, monto_real, ceco_codigo, ceco_codigo_raw, oi_codigo_raw, codigo_oi, hunting_zone, fase, motivo, detalle, nota, id_encargado",
      )
      .eq("estado_revision", "pendiente")
      .eq("fy", fy)
      .order("fecha_documento", { ascending: false })
      .limit(TAMANO_LOTE),
    supabase
      .from("gastos")
      .select("monto_real", { count: "exact" })
      .eq("estado_revision", "pendiente")
      .eq("fy", fy),
    obtenerCatalogosTriaje(supabase, fy),
  ]);

  const gastos = (pendientes.data ?? []) as unknown as GastoPendiente[];
  const totalPendientes = conteo.count ?? gastos.length;
  const montoPendiente = (conteo.data ?? []).reduce(
    (s, g) => s + Number((g as { monto_real: number }).monto_real ?? 0),
    0,
  );

  const errorCarga = pendientes.error?.message ?? conteo.error?.message ?? catalogos.error ?? null;

  return (
    <main className="mx-auto w-full max-w-[110rem] px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Sala de Triaje</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Completa la información que SAP no trae. SAP imputa cada gasto a un Centro de Costo o a
          una Orden Interna. Si vino con CeCo, asigna una{" "}
          <span className="font-mono">etiqueta</span> (#CAM) para saber a qué Hunting Zone
          pertenece, sin tocar la data de SAP. Si vino con OI real, el CeCo se deduce solo del
          padre. Fase, Motivo y Detalle son campos libres que sugieren los valores ya usados. Para
          cargar un reporte nuevo y cruzarlo con las facturas, usa <strong>Nueva carga SAP</strong>.
        </p>

        <dl className="mt-6 flex flex-wrap gap-8">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Pendientes</dt>
            <dd className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-900">
              {totalPendientes}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Monto sin asignar</dt>
            <dd className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-900">
              {moneda.format(montoPendiente)}
            </dd>
          </div>
        </dl>
      </header>

      <PestanasTriaje activa="/triaje" puedeCargar={puedeCargar} />

      {errorCarga && (
        <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          No se pudo cargar toda la información: {errorCarga}
        </p>
      )}

      <section className="mt-6">
        <TablaTriaje
          gastos={gastos}
          asignaciones={catalogos.asignaciones}
          sugerencias={catalogos.sugerencias}
          encargados={catalogos.encargados}
          totalPendientes={totalPendientes}
          soloLectura={!puedeEditar}
        />
      </section>
    </main>
  );
}
