/**
 * Plan de una carga de SAP: lo que se registraría, fila por fila, con las
 * decisiones del asistente ya aplicadas, SIN ESCRIBIR NADA.
 *
 * Los pasos 3 a 6 del asistente (cruce automático, match manual, rezagadas y
 * resumen) trabajan sobre este plan. Nada llega a la base hasta "Confirmar y
 * registrar" en el resumen, que corre ingestarSap() con las mismas decisiones:
 * mismo filtro, misma clasificación, mismo aplicarAjuste(). Lo que se ve en el
 * resumen es exactamente lo que se escribe.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  aplicarAjuste,
  cargarMaestras,
  claveFila,
  clasificarFilas,
  filtrarFilas,
  type AjusteGasto,
  type FiltroCarga,
} from "@/lib/ingesta/sap";
import type { LayoutSap, ResultadoSap } from "@/lib/sap/parser";
import type { EstadoRevision, MetodoCruce, OrigenAsignacion } from "@/types";
import type { Database } from "@/types/supabase";

type Cliente = SupabaseClient<Database>;

/** Una fila del plan: el gasto tal como quedaría registrado. */
export interface FilaPlan {
  clave: string;
  archivo: string;
  fecha: string;
  factura: string | null;
  proveedor: string | null;
  proveedor_codigo: string | null;
  texto_referencia: string | null;
  ceco_codigo_raw: string | null;
  oi_codigo_raw: string | null;
  monto_real: number;
  id_oi: string | null;
  id_hunting_zone: string | null;
  fase: string | null;
  motivo: string | null;
  detalle: string | null;
  id_factura_preregistrada: string | null;
  id_encargado: string | null;
  metodo_cruce: MetodoCruce | null;
  origen_hz: OrigenAsignacion;
  estado_revision: EstadoRevision;
  /** Por qué una decisión del asistente no se pudo aplicar entera. */
  aviso: string | null;
  /** El asistente tomó una decisión sobre esta fila. */
  ajustada: boolean;
}

export interface ArchivoPlan {
  nombreArchivo: string;
  layout: LayoutSap;
  filasLeidas: number;
  /** Subtotales y filas sin fecha o sin monto. */
  descartadas: number;
  omitidasPorFecha: number;
  omitidasPorProbable: number;
  /** Ya estaban cargadas: la base las ignora. */
  yaCargadas: number;
  aRegistrar: number;
  montoARegistrar: number;
  totalDeclarado: number | null;
  /** |suma del archivo − total declarado|, contra el archivo completo. */
  deltaTotal: number | null;
  cuadra: boolean;
  oisDesconocidas: string[];
}

/** Nombres para mostrar los ids del plan sin otra consulta. */
export interface NombresPlan {
  oi: Record<string, string>;
  hz: Record<string, string>;
  encargado: Record<string, string>;
  factura: Record<
    string,
    { numero: string; numeroOrden: string | null; montoEstimado: number | null; moneda: string }
  >;
}

export interface PlanCarga {
  archivos: ArchivoPlan[];
  filas: FilaPlan[];
  nombres: NombresPlan;
}

/** Misma tolerancia que la previsualización: medio centavo por línea. */
function tolerancia(filas: number): number {
  return Math.max(0.02, 0.005 * filas);
}

export async function planificarCarga(
  cliente: Cliente,
  archivos: Array<{ nombre: string; parseado: ResultadoSap }>,
  filtro: FiltroCarga,
  ajustes: Record<string, AjusteGasto>,
): Promise<PlanCarga> {
  const [maestras, hzs, equipo] = await Promise.all([
    cargarMaestras(cliente),
    cliente.from("hunting_zones").select("id, nombre"),
    cliente.from("miembros_equipo").select("id, nombre"),
  ]);
  if (hzs.error) throw new Error(`Leyendo hunting_zones: ${hzs.error.message}`);
  if (equipo.error) throw new Error(`Leyendo miembros_equipo: ${equipo.error.message}`);

  const salidaArchivos: ArchivoPlan[] = [];
  const filas: FilaPlan[] = [];

  for (const { nombre, parseado } of archivos) {
    const filtradas = await filtrarFilas(cliente, parseado, filtro);
    const exactas = new Set(filtradas.exactas);
    const nuevas = filtradas.filas.filter((f) => !exactas.has(f));

    const { registros, oisDesconocidas } = clasificarFilas(nuevas, parseado.layout, maestras, null);

    registros.forEach((base, i) => {
      const f = nuevas[i];
      const clave = claveFila(f);
      const ajuste = ajustes[clave];
      const { registro: r, aviso } = ajuste
        ? aplicarAjuste(base, f, parseado.layout, ajuste, maestras)
        : { registro: base, aviso: null };

      filas.push({
        clave,
        archivo: nombre,
        fecha: f.fecha,
        factura: f.factura,
        proveedor: f.proveedor,
        proveedor_codigo: f.proveedorCodigo,
        texto_referencia: f.textoReferencia,
        ceco_codigo_raw: f.cecoCodigo,
        oi_codigo_raw: f.oiCodigo,
        monto_real: f.montoReal,
        id_oi: r.id_oi,
        id_hunting_zone: r.id_hunting_zone,
        fase: r.fase,
        motivo: r.motivo,
        detalle: r.detalle,
        id_factura_preregistrada: r.id_factura_preregistrada,
        id_encargado: r.id_encargado,
        metodo_cruce: r.metodo_cruce,
        origen_hz: r.origen_hz,
        estado_revision: r.estado_revision,
        aviso,
        ajustada: ajuste !== undefined,
      });
    });

    const montoArchivo = parseado.filas.reduce((s, f) => s + f.montoReal, 0);
    const delta =
      parseado.totalDeclarado === null ? null : Math.abs(montoArchivo - parseado.totalDeclarado);

    salidaArchivos.push({
      nombreArchivo: nombre,
      layout: parseado.layout,
      filasLeidas: parseado.filasLeidas,
      descartadas: parseado.rechazos.length,
      omitidasPorFecha: filtradas.omitidasPorFecha,
      omitidasPorProbable: filtradas.omitidasPorProbable,
      yaCargadas: filtradas.exactas.length,
      aRegistrar: nuevas.length,
      montoARegistrar: nuevas.reduce((s, f) => s + f.montoReal, 0),
      totalDeclarado: parseado.totalDeclarado,
      deltaTotal: delta,
      cuadra: delta === null || delta <= tolerancia(parseado.filas.length),
      oisDesconocidas,
    });
  }

  const nombres: NombresPlan = {
    oi: Object.fromEntries([...maestras.oiPorCodigo.values()].map((o) => [o.id, o.codigo])),
    hz: Object.fromEntries((hzs.data ?? []).map((h) => [h.id as string, h.nombre as string])),
    encargado: Object.fromEntries(
      (equipo.data ?? []).map((m) => [m.id as string, m.nombre as string]),
    ),
    factura: {},
  };
  for (const f of filas) {
    const id = f.id_factura_preregistrada;
    const factura = id ? maestras.facturaPorId.get(id) : undefined;
    if (id && factura) {
      nombres.factura[id] = {
        numero: factura.numeroFactura,
        numeroOrden: factura.numeroOrden,
        montoEstimado: factura.montoEstimado,
        moneda: factura.moneda,
      };
    }
  }

  return { archivos: salidaArchivos, filas, nombres };
}
