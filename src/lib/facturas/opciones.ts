/**
 * Catálogos que necesita el formulario de facturas (alta y edición): órdenes
 * vigentes con sus fondos del trimestre, CeCos, encargados y sugerencias de
 * taxonomía. Lo usan /facturas (modal de edición) y /facturas/nueva.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  OpcionCeco,
  OpcionOi,
  OpcionSelect,
  Sugerencias,
} from "@/components/facturas/FormularioFactura";
import { trimestreActual } from "@/lib/fiscal";
import { obtenerDisponibilidad } from "@/lib/presupuesto/disponibilidad";
import { obtenerOrdenesInternasActivas } from "@/lib/presupuesto/ordenesInternas";
import { etiquetaVigencia, vigenteEnFy } from "@/lib/presupuesto/vigencia";
import type { Database } from "@/types/supabase";

export interface OpcionesFormularioFactura {
  ordenesInternas: OpcionOi[];
  cecos: OpcionCeco[];
  encargados: OpcionSelect[];
  sugerencias: Sugerencias;
  error: string | null;
}

export async function obtenerOpcionesFormulario(
  supabase: SupabaseClient<Database>,
  fy: number,
): Promise<OpcionesFormularioFactura> {
  const tActual = trimestreActual();

  // Fondos del trimestre en curso por OI: se muestran al elegir la orden, que
  // es el momento en que hace falta saber si alcanza.
  const disponibilidad = await obtenerDisponibilidad(supabase, fy).catch(() => []);
  const fondosPorOi = new Map(
    disponibilidad
      .filter((d) => d.trimestre === tActual && d.id_oi)
      .map((d) => [
        d.id_oi as string,
        { saldo: d.saldo, disponible: d.disponible, consumido: d.consumido },
      ]),
  );

  const [ois, hzs, cecosRes, tax, equipo] = await Promise.all([
    obtenerOrdenesInternasActivas(supabase),
    supabase.from("hunting_zones").select("id, nombre").eq("activo", true).order("orden_display"),
    supabase.from("cecos").select("id, codigo_sap, nombre").eq("activo", true).order("codigo_sap"),
    supabase.from("v_valores_taxonomia").select("campo, valor").order("usos", { ascending: false }),
    supabase.from("miembros_equipo").select("id, nombre").eq("activo", true).order("nombre"),
  ]);

  const hzPorId = new Map((hzs.data ?? []).map((h) => [h.id as string, h.nombre as string]));

  // Las órdenes reales se filtran por vigencia del año fiscal en curso; las
  // etiquetas son transversales y siempre están disponibles.
  const ordenesInternas: OpcionOi[] = ois.data
    .filter((o) => o.tipo === "tag" || vigenteEnFy(o, fy))
    .map((o) => {
      const fondos = fondosPorOi.get(o.id);
      return {
        id: o.id,
        codigo: o.codigo_oi,
        nombre: o.nombre,
        tipo: o.tipo,
        idCeco: o.id_ceco,
        idHuntingZone: o.id_hunting_zone,
        huntingZone: o.id_hunting_zone ? (hzPorId.get(o.id_hunting_zone) ?? null) : null,
        saldoTrimestre: fondos?.saldo ?? null,
        disponibleTrimestre: fondos?.disponible ?? null,
        consumidoTrimestre: fondos?.consumido ?? null,
        vigencia: o.tipo === "tag" ? null : etiquetaVigencia(o),
      };
    });

  const cecos: OpcionCeco[] = (cecosRes.data ?? []).map((c) => ({
    id: c.id as string,
    codigo: c.codigo_sap as string,
    nombre: c.nombre as string,
  }));

  const valores = (tax.data ?? []) as unknown as Array<{ campo: string; valor: string }>;
  const sugerencias: Sugerencias = {
    fase: valores.filter((v) => v.campo === "fase").map((v) => v.valor),
    motivo: valores.filter((v) => v.campo === "motivo").map((v) => v.valor),
    detalle: valores.filter((v) => v.campo === "detalle").map((v) => v.valor),
  };

  const error = ois.error ?? hzs.error ?? cecosRes.error ?? tax.error ?? equipo.error ?? null;

  return {
    ordenesInternas,
    cecos,
    encargados: (equipo.data ?? []).map((m) => ({ id: m.id, etiqueta: m.nombre })),
    sugerencias,
    error: error?.message ?? null,
  };
}
