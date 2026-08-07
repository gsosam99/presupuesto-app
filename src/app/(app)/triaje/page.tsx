import {
  TablaTriaje,
  type GastoPendiente,
  type OpcionAsignacion,
  type Sugerencias,
} from "@/components/triaje/TablaTriaje";
import {
  etiquetaVigencia,
  vigenteEnFecha,
  type ConVigencia,
} from "@/lib/presupuesto/vigencia";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Triaje — IENN Gastos App" };
export const dynamic = "force-dynamic";

/** Cuántos pendientes se traen por lote. */
const TAMANO_LOTE = 500;

const moneda = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default async function TriajePage() {
  const supabase = await createSupabaseServerClient();

  const [pendientes, conteo, ois, tags, hzs, cecos, valores] = await Promise.all([
    supabase
      .from("v_gastos_enriquecidos")
      .select(
        "id, fecha_documento, factura, proveedor, proveedor_codigo, texto_referencia, grupo_clase_coste, monto_real, ceco_codigo, ceco_codigo_raw, oi_codigo_raw, codigo_oi, hunting_zone, fase, motivo, detalle, nota",
      )
      .eq("estado_revision", "pendiente")
      .order("fecha_documento", { ascending: false })
      .limit(TAMANO_LOTE),
    supabase
      .from("gastos")
      .select("monto_real", { count: "exact" })
      .eq("estado_revision", "pendiente"),
    supabase
      .from("ordenes_internas")
      .select("codigo_oi, nombre, id_hunting_zone, vigencia_desde, vigencia_hasta")
      .eq("activo", true)
      .order("codigo_oi"),
    supabase
      .from("hunting_zone_tags")
      .select("tag, id_hunting_zone")
      .eq("activo", true)
      .order("tag"),
    supabase.from("hunting_zones").select("id, nombre"),
    supabase.from("cecos").select("codigo_sap, nombre, id_hunting_zone").eq("activo", true).order("codigo_sap"),
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

  // Solo se ofrecen las órdenes vigentes hoy: no tiene sentido imputar un
  // gasto a una OI que ya venció.
  const hoy = new Date();
  for (const o of ois.data ?? []) {
    if (!vigenteEnFecha(o as unknown as ConVigencia, hoy)) continue;
    const valor = o.codigo_oi as string;
    const rango = etiquetaVigencia(o as unknown as ConVigencia);
    porValor.set(valor, {
      valor,
      descripcion: `OI · ${
        hzPorId.get(o.id_hunting_zone as string) ?? (o.nombre as string) ?? "sin proyecto"
      }${rango ? ` · ${rango}` : ""}`,
    });
  }

  // Centros de costo: el gasto se imputa al CeCo cuando la HZ no usa OIs.
  for (const c of cecos.data ?? []) {
    const valor = c.codigo_sap as string;
    if (porValor.has(valor)) continue;
    porValor.set(valor, {
      valor,
      descripcion: `CeCo · ${
        hzPorId.get(c.id_hunting_zone as string) ?? (c.nombre as string) ?? "sin proyecto"
      }`,
    });
  }

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

  return (
    <main className="mx-auto w-full max-w-[110rem] px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Sala de Triaje</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Completa la información que SAP no trae. En la columna de asignación va una{" "}
          <span className="font-mono">Orden Interna vigente</span>, un{" "}
          <span className="font-mono">Centro de Costo</span> o una etiqueta (
          <span className="font-mono">#CAM</span>). Un gasto se imputa a una OI o a un
          CeCo, nunca a los dos. Fase, Motivo y Detalle son campos libres que sugieren los valores ya
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
