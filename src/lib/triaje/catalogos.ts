/**
 * Catálogos de la grilla de triaje: el pool de asignación (OIs vigentes y
 * etiquetas), las sugerencias de taxonomía y los encargados. Los usan la Sala
 * de Triaje y el paso "Rezagadas" del asistente de cruce.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { OpcionAsignacion, Sugerencias } from "@/components/triaje/TablaTriaje";
import { obtenerOrdenesInternasActivas } from "@/lib/presupuesto/ordenesInternas";
import { etiquetaVigencia, vigenteEnFecha } from "@/lib/presupuesto/vigencia";
import { obtenerSugerenciasMotivo } from "@/lib/taxonomia/motivos";
import type { Database } from "@/types/supabase";

export interface CatalogosTriaje {
  asignaciones: OpcionAsignacion[];
  sugerencias: Sugerencias;
  encargados: Array<{ id: string; etiqueta: string }>;
  error: string | null;
}

export async function obtenerCatalogosTriaje(
  supabase: SupabaseClient<Database>,
  /** Año fiscal de las sugerencias de Motivo (macroactividades del Plan + usados). */
  fy: number,
): Promise<CatalogosTriaje> {
  const [ois, tags, hzs, valores, equipo, motivos] = await Promise.all([
    obtenerOrdenesInternasActivas(supabase),
    supabase
      .from("hunting_zone_tags")
      .select("tag, id_hunting_zone")
      .eq("activo", true)
      .order("tag"),
    supabase.from("hunting_zones").select("id, nombre"),
    supabase.from("v_valores_taxonomia").select("campo, valor").order("usos", { ascending: false }),
    supabase.from("miembros_equipo").select("id, nombre").eq("activo", true).order("nombre"),
    obtenerSugerenciasMotivo(supabase, fy),
  ]);

  const hzPorId = new Map((hzs.data ?? []).map((h) => [h.id as string, h.nombre as string]));

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

  const filasValores = (valores.data ?? []) as unknown as Array<{ campo: string; valor: string }>;

  const error = ois.error ?? tags.error ?? hzs.error ?? valores.error ?? equipo.error ?? null;

  return {
    asignaciones: [...porValor.values()],
    sugerencias: {
      fase: filasValores.filter((v) => v.campo === "fase").map((v) => v.valor),
      motivo: motivos.motivo,
      motivosPlan: motivos.motivosPlan,
      detalle: filasValores.filter((v) => v.campo === "detalle").map((v) => v.valor),
    },
    encargados: (equipo.data ?? []).map((m) => ({ id: m.id, etiqueta: m.nombre })),
    error: error?.message ?? motivos.error,
  };
}
