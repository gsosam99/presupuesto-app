/**
 * Flujo A — ingesta de los reportes de SAP.
 *
 * Pasos:
 *   2. Parsear MIME-HTML y descartar subtotales  -> src/lib/sap/parser.ts
 *   3. Cruzar códigos de OI y CeCo con las maestras
 *   4. Cruzar el número de factura contra el PRE-REGISTRO de facturas, que es
 *      lo que trae la taxonomía y el proyecto ya definidos por el usuario
 *   5. Si el gasto quedó huérfano, inferir la Hunting Zone desde un #TAG
 *
 * El cruce por factura es determinístico: nunca usa el monto, porque la
 * factura puede venir en Bs y SAP la convierte a la tasa BCV del momento.
 * Una misma factura puede matchear VARIOS gastos (SAP abre una posición por
 * línea) y eso es correcto: todas heredan la misma clasificación.
 *
 * Reglas de estado al ingresar:
 *   - HZ marcada como archivar_automatico  -> excluido (papelera)
 *   - Factura pre-registrada que matchea    -> aprobado
 *   - OI encontrada en la maestra           -> aprobado
 *   - Resto                                 -> pendiente (Sala de Triaje)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { claveComparacion, normalizarNumeroFactura } from "@/lib/sap/normalizar";
import type { FilaSap, RechazoSap, ResultadoSap } from "@/lib/sap/parser";
import type { Database } from "@/types/supabase";
import type { EstadoRevision, OrigenAsignacion, TipoCarga } from "@/types";

type Cliente = SupabaseClient<Database>;

const LOTE = 500;

export interface ResumenIngesta {
  idCarga: string;
  nombreArchivo: string;
  layout: TipoCarga;
  filasLeidas: number;
  filasSubtotal: number;
  insertadas: number;
  duplicadas: number;
  rechazadas: number;
  aprobadas: number;
  pendientes: number;
  archivadas: number;
  /** Gastos que cruzaron contra una factura pre-registrada. */
  conMatchFactura: number;
  /** Facturas con más de un pre-registro candidato: requieren asociación manual. */
  facturasAmbiguas: number;
  conTagInferido: number;
  montoReal: number;
  totalDeclarado: number | null;
  /** |suma parseada − total del archivo|. SAP arrastra centavos de redondeo. */
  deltaTotal: number | null;
  oisDesconocidas: string[];
}

/** Trae todas las filas de una tabla/vista paginando de a 1000. */
async function traerTodo<T>(
  cliente: Cliente,
  tabla: string,
  columnas: string,
): Promise<T[]> {
  const salida: T[] = [];
  const paso = 1000;

  for (let desde = 0; ; desde += paso) {
    const { data, error } = await cliente
      .from(tabla)
      .select(columnas)
      .range(desde, desde + paso - 1);

    if (error) throw new Error(`Leyendo ${tabla}: ${error.message}`);
    const filas = (data ?? []) as unknown as T[];
    salida.push(...filas);
    if (filas.length < paso) break;
  }

  return salida;
}

export interface FacturaPreregistrada {
  id: string;
  numeroNormalizado: string;
  /** Número de cuenta del proveedor (código SAP). Desempata, no el nombre. */
  proveedorCodigo: string | null;
  idOi: string | null;
  idHz: string | null;
  fase: string | null;
  motivo: string | null;
  detalle: string | null;
}

export interface Maestras {
  cecoPorCodigo: Map<string, string>;
  oiPorCodigo: Map<string, { id: string; idCeco: string | null; idHz: string | null }>;
  hzArchivable: Set<string>;
  /** Tags ordenados de más largo a más corto: #NEW.CAM debe ganarle a #CAM. */
  tags: Array<{ tag: string; idHz: string }>;
  /** Puede haber varias por número: SAP repite la factura por cada posición. */
  facturasPorNumero: Map<string, FacturaPreregistrada[]>;
}

export async function cargarMaestras(cliente: Cliente): Promise<Maestras> {
  const [cecos, ois, hzs, tags, facturas] = await Promise.all([
    traerTodo<{ id: string; codigo_sap: string }>(cliente, "cecos", "id, codigo_sap"),
    traerTodo<{
      id: string;
      codigo_oi: string;
      id_ceco: string | null;
      id_hunting_zone: string | null;
    }>(cliente, "ordenes_internas", "id, codigo_oi, id_ceco, id_hunting_zone"),
    traerTodo<{ id: string; archivar_automatico: boolean }>(
      cliente,
      "hunting_zones",
      "id, archivar_automatico",
    ),
    traerTodo<{ tag: string; id_hunting_zone: string }>(
      cliente,
      "hunting_zone_tags",
      "tag, id_hunting_zone",
    ),
    traerTodo<{
      id: string;
      numero_normalizado: string | null;
      proveedor_codigo: string | null;
      id_oi: string | null;
      id_hunting_zone: string | null;
      fase: string | null;
      motivo: string | null;
      detalle: string | null;
      activo: boolean;
    }>(
      cliente,
      "facturas_preregistradas",
      "id, numero_normalizado, proveedor_codigo, id_oi, id_hunting_zone, fase, motivo, detalle, activo",
    ),
  ]);

  const facturasPorNumero = new Map<string, FacturaPreregistrada[]>();
  for (const f of facturas) {
    if (!f.activo || !f.numero_normalizado) continue;
    const entrada: FacturaPreregistrada = {
      id: f.id,
      numeroNormalizado: f.numero_normalizado,
      proveedorCodigo: f.proveedor_codigo,
      idOi: f.id_oi,
      idHz: f.id_hunting_zone,
      fase: f.fase,
      motivo: f.motivo,
      detalle: f.detalle,
    };
    const previas = facturasPorNumero.get(f.numero_normalizado);
    if (previas) previas.push(entrada);
    else facturasPorNumero.set(f.numero_normalizado, [entrada]);
  }

  return {
    cecoPorCodigo: new Map(cecos.map((c) => [c.codigo_sap, c.id])),
    oiPorCodigo: new Map(
      ois.map((o) => [
        o.codigo_oi,
        { id: o.id, idCeco: o.id_ceco, idHz: o.id_hunting_zone },
      ]),
    ),
    hzArchivable: new Set(hzs.filter((h) => h.archivar_automatico).map((h) => h.id)),
    tags: tags
      .map((t) => ({ tag: t.tag.toUpperCase(), idHz: t.id_hunting_zone }))
      .sort((a, b) => b.tag.length - a.tag.length),
    facturasPorNumero,
  };
}

/** Paso 5: busca un #TAG conocido dentro del texto de referencia. */
function inferirHzDesdeTexto(
  texto: string | null,
  tags: Maestras["tags"],
): string | null {
  const t = claveComparacion(texto);
  if (t === null) return null;
  return tags.find((x) => t.includes(x.tag)) ?.idHz ?? null;
}

type ResultadoMatch =
  | { tipo: "sin_match" }
  | { tipo: "unico"; factura: FacturaPreregistrada }
  | { tipo: "ambiguo"; candidatas: FacturaPreregistrada[] };

/**
 * Paso 4: cruza el número de factura contra el pre-registro.
 * Si hay más de un candidato se intenta desempatar por proveedor; si sigue
 * habiendo ambigüedad NO se asigna nada y el gasto queda para asociación
 * manual en el triaje, que es exactamente lo que pidió el usuario.
 */
export function buscarFacturaPreregistrada(
  fila: FilaSap,
  facturasPorNumero: Maestras["facturasPorNumero"],
): ResultadoMatch {
  const numero = normalizarNumeroFactura(fila.factura);
  if (numero === null) return { tipo: "sin_match" };

  const candidatas = facturasPorNumero.get(numero);
  if (!candidatas || candidatas.length === 0) return { tipo: "sin_match" };
  if (candidatas.length === 1) return { tipo: "unico", factura: candidatas[0] };

  // Desempate por el código SAP del acreedor, no por el nombre: el reporte de
  // CeCo trae el código incluso cuando el nombre viene como "Sin asignar".
  const codigo = claveComparacion(fila.proveedorCodigo);
  if (codigo !== null) {
    const porCodigo = candidatas.filter(
      (c) => claveComparacion(c.proveedorCodigo) === codigo,
    );
    if (porCodigo.length === 1) return { tipo: "unico", factura: porCodigo[0] };
  }

  return { tipo: "ambiguo", candidatas };
}

export interface OpcionesIngesta {
  nombreArchivo: string;
  hashArchivo: string;
  idUsuario: string | null;
}

export interface Clasificacion {
  registros: Array<Record<string, string | number | null>>;
  conMatchFactura: number;
  facturasAmbiguas: number;
  conTagInferido: number;
  oisDesconocidas: string[];
}

/**
 * Pasos 3, 4 y 5. Función pura sobre las maestras ya cargadas: no toca la base,
 * así que se puede verificar contra archivos de prueba sin escribir nada.
 */
export function clasificarFilas(
  filas: FilaSap[],
  layout: TipoCarga,
  maestras: Maestras,
  idCarga: string | null,
): Clasificacion {
  const oisDesconocidas = new Set<string>();
  let conMatchFactura = 0;
  let facturasAmbiguas = 0;
  let conTagInferido = 0;

  const registros = filas.map((f) => {
    // --- Paso 3: maestras ---------------------------------------------------
    const oi = f.oiCodigo ? maestras.oiPorCodigo.get(f.oiCodigo) : undefined;
    if (f.oiCodigo && !oi) oisDesconocidas.add(f.oiCodigo);

    // --- Paso 4: pre-registro de facturas -----------------------------------
    const match = buscarFacturaPreregistrada(f, maestras.facturasPorNumero);
    const prerregistro = match.tipo === "unico" ? match.factura : null;
    if (match.tipo === "unico") conMatchFactura += 1;
    if (match.tipo === "ambiguo") facturasAmbiguas += 1;

    // La OI de SAP manda (es el asiento contable). El pre-registro completa
    // cuando SAP no la trae.
    const idOi = oi?.id ?? prerregistro?.idOi ?? null;

    let idHz = oi?.idHz ?? prerregistro?.idHz ?? null;
    let origen: OrigenAsignacion = "sin_asignar";
    if (oi?.idHz) origen = "orden_interna";
    else if (prerregistro?.idHz) origen = "prerregistro";

    // --- Paso 5: #TAG en el texto, solo si sigue huérfano --------------------
    if (idHz === null) {
      const inferida = inferirHzDesdeTexto(f.textoReferencia, maestras.tags);
      if (inferida !== null) {
        idHz = inferida;
        origen = "tag_texto";
        conTagInferido += 1;
      }
    }

    let estado: EstadoRevision;
    if (idHz !== null && maestras.hzArchivable.has(idHz)) {
      estado = "excluido";
    } else if (prerregistro !== null || oi) {
      estado = "aprobado";
    } else {
      estado = "pendiente";
    }

    const idCeco =
      (f.cecoCodigo ? maestras.cecoPorCodigo.get(f.cecoCodigo) : undefined) ??
      oi?.idCeco ??
      null;

    return {
      fuente: layout,
      factura: f.factura,
      fecha_documento: f.fecha,
      proveedor_codigo: f.proveedorCodigo,
      proveedor: f.proveedor,
      texto_referencia: f.textoReferencia,
      grupo_clase_coste: f.grupoClaseCoste,
      ceco_codigo_raw: f.cecoCodigo,
      oi_codigo_raw: f.oiCodigo,
      monto_real: f.montoReal,
      monto_plan_sap: f.montoPlan,
      monto_comprometido: f.montoComprometido,
      id_ceco: idCeco,
      id_oi: idOi,
      id_hunting_zone: idHz,
      fase: prerregistro?.fase ?? null,
      motivo: prerregistro?.motivo ?? null,
      detalle: prerregistro?.detalle ?? null,
      id_factura_preregistrada: prerregistro?.id ?? null,
      origen_hz: origen,
      estado_revision: estado,
      id_carga: idCarga,
    };
  });

  return {
    registros,
    conMatchFactura,
    facturasAmbiguas,
    conTagInferido,
    oisDesconocidas: [...oisDesconocidas],
  };
}

export async function ingestarSap(
  cliente: Cliente,
  parseado: ResultadoSap,
  opciones: OpcionesIngesta,
): Promise<ResumenIngesta> {
  const maestras = await cargarMaestras(cliente);
  const rechazos: RechazoSap[] = [...parseado.rechazos];

  const { data: carga, error: errorCarga } = await cliente
    .from("cargas")
    .insert({
      tipo: parseado.layout,
      nombre_archivo: opciones.nombreArchivo,
      hash_archivo: opciones.hashArchivo,
      estado: "procesando",
      filas_leidas: parseado.filasLeidas,
      id_usuario: opciones.idUsuario,
    })
    .select("id")
    .single();

  if (errorCarga || !carga) {
    throw new Error(`No se pudo registrar la carga: ${errorCarga?.message}`);
  }
  const idCarga = carga.id as string;

  const { registros, conMatchFactura, facturasAmbiguas, conTagInferido, oisDesconocidas } =
    clasificarFilas(parseado.filas, parseado.layout, maestras, idCarga);

  // --- Inserción por lotes -------------------------------------------------
  let insertadas = 0;
  let duplicadas = 0;

  for (let i = 0; i < registros.length; i += LOTE) {
    const lote = registros.slice(i, i + LOTE);
    const { data, error } = await cliente
      .from("gastos")
      .upsert(lote, { onConflict: "hash_dedupe", ignoreDuplicates: true })
      .select("id");

    if (error) {
      // Aislar la fila problemática en vez de perder el lote entero.
      for (const [j, r] of lote.entries()) {
        const { error: e1 } = await cliente
          .from("gastos")
          .upsert([r], { onConflict: "hash_dedupe", ignoreDuplicates: true });
        if (e1) {
          if (e1.code === "23505") duplicadas += 1;
          else {
            rechazos.push({
              fila: parseado.filas[i + j]?.fila ?? i + j,
              motivo: e1.message,
              payload: {
                factura: String(r.factura ?? ""),
                fecha: String(r.fecha_documento ?? ""),
                monto: Number(r.monto_real ?? 0),
              },
            });
          }
        } else insertadas += 1;
      }
    } else {
      insertadas += data?.length ?? 0;
      duplicadas += lote.length - (data?.length ?? 0);
    }
  }

  if (rechazos.length > 0) {
    await cliente.from("cargas_rechazos").insert(
      rechazos.map((r) => ({
        id_carga: idCarga,
        fila: r.fila,
        motivo: r.motivo,
        payload: r.payload,
      })),
    );
  }

  const montoReal = parseado.filas.reduce((s, f) => s + (f.montoReal ?? 0), 0);

  const avisos: string[] = [];
  if (oisDesconocidas.length > 0) {
    avisos.push(`Órdenes internas fuera de la maestra: ${oisDesconocidas.join(", ")}`);
  }
  if (facturasAmbiguas > 0) {
    avisos.push(
      `${facturasAmbiguas} gastos con más de una factura pre-registrada candidata: requieren asociación manual`,
    );
  }

  await cliente
    .from("cargas")
    .update({
      estado: "completada",
      filas_insertadas: insertadas,
      filas_duplicadas: duplicadas,
      filas_rechazadas: rechazos.length,
      mensaje: avisos.length > 0 ? avisos.join(" · ") : null,
      finalizada_at: new Date().toISOString(),
    })
    .eq("id", idCarga);

  return {
    idCarga,
    nombreArchivo: opciones.nombreArchivo,
    layout: parseado.layout,
    filasLeidas: parseado.filasLeidas,
    filasSubtotal: parseado.filasSubtotal,
    insertadas,
    duplicadas,
    rechazadas: rechazos.length,
    aprobadas: registros.filter((r) => r.estado_revision === "aprobado").length,
    pendientes: registros.filter((r) => r.estado_revision === "pendiente").length,
    archivadas: registros.filter((r) => r.estado_revision === "excluido").length,
    conMatchFactura,
    facturasAmbiguas,
    conTagInferido,
    montoReal,
    totalDeclarado: parseado.totalDeclarado,
    deltaTotal:
      parseado.totalDeclarado === null
        ? null
        : Math.abs(montoReal - parseado.totalDeclarado),
    oisDesconocidas,
  };
}
