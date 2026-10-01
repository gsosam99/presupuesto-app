/**
 * Catálogos que necesita el formulario de facturas (alta y edición): órdenes
 * vigentes con sus fondos del mes en curso, CeCos, encargados y sugerencias de
 * taxonomía. Lo usan /facturas (modal de edición) y /facturas/nueva.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  OpcionCeco,
  OpcionOi,
  OpcionSelect,
  Sugerencias,
} from "@/components/facturas/FormularioFactura";
import { mesesDeTrimestre, trimestreActual } from "@/lib/fiscal";
import { obtenerFondos } from "@/lib/presupuesto/fondos";
import {
  obtenerFechaDatosSap,
  obtenerPreregistrado,
  sumarPreregistrado,
} from "@/lib/presupuesto/preregistrado";
import { obtenerOrdenesInternasActivas } from "@/lib/presupuesto/ordenesInternas";
import { etiquetaVigencia, vigenteEnFy } from "@/lib/presupuesto/vigencia";
import { obtenerSugerenciasMotivo } from "@/lib/taxonomia/motivos";
import type { Database } from "@/types/supabase";

export interface OpcionesFormularioFactura {
  ordenesInternas: OpcionOi[];
  cecos: OpcionCeco[];
  encargados: OpcionSelect[];
  sugerencias: Sugerencias;
  /** Fecha de la última carga de SAP: el Real es "al" esa fecha. */
  fechaDatosSap: string | null;
  error: string | null;
}

export async function obtenerOpcionesFormulario(
  supabase: SupabaseClient<Database>,
  fy: number,
): Promise<OpcionesFormularioFactura> {
  const tActual = trimestreActual();
  const mesActual = new Date().getMonth() + 1;
  // Meses del trimestre en curso hasta hoy: lo pre-registrado en ellos consume
  // el mismo Disponible, que se acumula dentro del trimestre.
  const mesesHastaHoy = mesesDeTrimestre(tActual).slice(
    0,
    mesesDeTrimestre(tActual).indexOf(mesActual) + 1,
  );

  // Fondos del mes en curso por OI: se muestran al elegir la orden, que es el
  // momento en que hace falta saber si alcanza.
  const fondos = await obtenerFondos(supabase, fy).catch(() => []);
  const fondosPorOi = new Map(
    fondos
      .filter((f) => f.estado_mes === "actual" && f.id_oi)
      .map((f) => {
        const realTrimestre = fondos
          .filter(
            (x) => x.clave === f.clave && x.trimestre === f.trimestre && x.estado_mes !== "futuro",
          )
          .reduce((s, x) => s + x.monto_real, 0);
        return [f.id_oi as string, { disponible: f.disponible, realTrimestre }];
      }),
  );

  const [ois, hzs, cecosRes, tax, equipo, preregistrado, fechaDatosSap, motivos] = await Promise.all([
    obtenerOrdenesInternasActivas(supabase),
    supabase.from("hunting_zones").select("id, nombre").eq("activo", true).order("orden_display"),
    supabase.from("cecos").select("id, codigo_sap, nombre").eq("activo", true).order("codigo_sap"),
    supabase.from("v_valores_taxonomia").select("campo, valor").order("usos", { ascending: false }),
    supabase.from("miembros_equipo").select("id, nombre").eq("activo", true).order("nombre"),
    obtenerPreregistrado(supabase, fy),
    obtenerFechaDatosSap(supabase),
    obtenerSugerenciasMotivo(supabase, fy),
  ]);

  const hzPorId = new Map((hzs.data ?? []).map((h) => [h.id as string, h.nombre as string]));

  // Las órdenes reales se filtran por vigencia del año fiscal en curso; las
  // etiquetas son transversales y siempre están disponibles.
  const ordenesInternas: OpcionOi[] = ois.data
    .filter((o) => o.tipo === "tag" || vigenteEnFy(o, fy))
    .map((o) => {
      const fondosOi = fondosPorOi.get(o.id);
      return {
        id: o.id,
        codigo: o.codigo_oi,
        nombre: o.nombre,
        tipo: o.tipo,
        idCeco: o.id_ceco,
        idHuntingZone: o.id_hunting_zone,
        huntingZone: o.id_hunting_zone ? (hzPorId.get(o.id_hunting_zone) ?? null) : null,
        disponibleMes: fondosOi?.disponible ?? null,
        realTrimestre: fondosOi?.realTrimestre ?? null,
        preregistradoTrimestre: sumarPreregistrado(preregistrado.data, o.id, mesesHastaHoy).usd,
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
    // Motivo: Plan del año fiscal primero, luego lo usado en ese año.
    motivo: motivos.motivo,
    motivosPlan: motivos.motivosPlan,
    detalle: valores.filter((v) => v.campo === "detalle").map((v) => v.valor),
  };

  const error = ois.error ?? hzs.error ?? cecosRes.error ?? tax.error ?? equipo.error ?? null;

  return {
    ordenesInternas,
    cecos,
    encargados: (equipo.data ?? []).map((m) => ({ id: m.id, etiqueta: m.nombre })),
    sugerencias,
    fechaDatosSap,
    error: error?.message ?? preregistrado.error ?? motivos.error,
  };
}
