import {
  TablaTriaje,
  type GastoPendiente,
  type OpcionAsignacion,
  type Sugerencias,
} from "@/components/triaje/TablaTriaje";
import { obtenerFySeleccionado } from "@/lib/fiscal-seleccionado";
import { moneda } from "@/lib/format";
import { obtenerOrdenesInternasActivas } from "@/lib/presupuesto/ordenesInternas";
import { etiquetaVigencia, vigenteEnFecha } from "@/lib/presupuesto/vigencia";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Triaje — IENN Gastos App" };
export const dynamic = "force-dynamic";

/** Cuántos pendientes se traen por lote. */
const TAMANO_LOTE = 500;

export default async function TriajePage() {
  const supabase = await createSupabaseServerClient();
  const fy = await obtenerFySeleccionado();

  const [pendientes, conteo, ois, tags, hzs, valores] = await Promise.all([
    supabase
      .from("v_gastos_enriquecidos")
      .select(
        "id, fecha_documento, factura, proveedor, proveedor_codigo, texto_referencia, grupo_clase_coste, monto_real, ceco_codigo, ceco_codigo_raw, oi_codigo_raw, codigo_oi, hunting_zone, fase, motivo, detalle, nota",
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
    obtenerOrdenesInternasActivas(supabase),
    supabase
      .from("hunting_zone_tags")
      .select("tag, id_hunting_zone")
      .eq("activo", true)
      .order("tag"),
    supabase.from("hunting_zones").select("id, nombre"),
    supabase
      .from("v_valores_taxonomia")
      .select("campo, valor")
      .order("usos", { ascending: false }),
  ]);

  const gastos = (pendientes.data ?? []) as unknown as GastoPendiente[];
  const totalPendientes = conteo.count ?? gastos.length;
  const montoPendiente = (conteo.data ?? []).reduce(
    (s, g) => s + Number((g as { monto_real: number }).monto_real ?? 0),
    0,
  );

  const hzPorId = new Map(
    (hzs.data ?? []).map((h) => [h.id as string, h.nombre as string]),
  );

  // Un solo pool de asignación: cualquier OI del sistema o cualquier etiqueta.
  // Se deduplica por código porque varias etiquetas del histórico (#SNA,
  // #TRANS.EP, #PLANIF.EST) también existen como Orden Interna; en ese caso
  // gana la OI, que es la que arrastra CeCo además de Hunting Zone.
  const porValor = new Map<string, OpcionAsignacion>();

  // Las órdenes reales se filtran por vigencia: no tiene sentido imputar un
  // gasto a una orden vencida. Los tags (#CAM) son transversales y no vencen.
  const hoy = new Date();
  for (const o of ois.data) {
    const esTag = o.tipo === "tag";
    if (!esTag && !vigenteEnFecha(o, hoy)) continue;

    const valor = o.codigo_oi;
    const hz = (o.id_hunting_zone ? hzPorId.get(o.id_hunting_zone) : undefined) ?? "sin proyecto";
    const rango = esTag ? null : etiquetaVigencia(o);

    porValor.set(valor, {
      valor,
      descripcion: `${esTag ? "Etiqueta" : "OI"} · ${hz}${rango ? ` · ${rango}` : ""}`,
    });
  }

  // Etiquetas que existen en hunting_zone_tags pero todavía no como OI.
  for (const t of tags.data ?? []) {
    const valor = t.tag as string;
    if (porValor.has(valor)) continue;
    porValor.set(valor, {
      valor,
      descripcion: `Etiqueta · ${hzPorId.get(t.id_hunting_zone as string) ?? ""}`,
    });
  }

  const asignaciones: OpcionAsignacion[] = [...porValor.values()];

  const filasValores = (valores.data ?? []) as unknown as Array<{
    campo: string;
    valor: string;
  }>;
  const sugerencias: Sugerencias = {
    fase: filasValores.filter((v) => v.campo === "fase").map((v) => v.valor),
    motivo: filasValores.filter((v) => v.campo === "motivo").map((v) => v.valor),
    detalle: filasValores.filter((v) => v.campo === "detalle").map((v) => v.valor),
  };

  const errorCarga =
    pendientes.error ?? conteo.error ?? ois.error ?? tags.error ?? hzs.error ?? valores.error ?? null;

  return (
    <main className="mx-auto w-full max-w-[110rem] px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Sala de Triaje</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Completa la información que SAP no trae. SAP imputa cada gasto a un Centro de Costo o a una Orden Interna. Si vino con
          CeCo, asigna una <span className="font-mono">etiqueta</span> (#CAM) para saber a
          qué Hunting Zone pertenece, sin tocar la data de SAP. Si vino con OI real, el
          CeCo se deduce solo del padre. Fase, Motivo y Detalle son campos libres que sugieren los valores ya
          usados.
        </p>

        <dl className="mt-6 flex flex-wrap gap-8">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Pendientes</dt>
            <dd className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-900">
              {totalPendientes}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              Monto sin asignar
            </dt>
            <dd className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-900">
              {moneda.format(montoPendiente)}
            </dd>
          </div>
        </dl>
      </header>

      {errorCarga && (
        <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          No se pudo cargar toda la información: {errorCarga.message}
        </p>
      )}

      <section className="mt-8">
        <TablaTriaje
          gastos={gastos}
          asignaciones={asignaciones}
          sugerencias={sugerencias}
          totalPendientes={totalPendientes}
        />
      </section>
    </main>
  );
}
