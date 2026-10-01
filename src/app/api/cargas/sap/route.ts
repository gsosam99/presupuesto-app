import { createHash, randomUUID } from "node:crypto";

import { z } from "zod";

import { requireApiPermiso } from "@/lib/auth";
import { planificarCarga } from "@/lib/ingesta/planCarga";
import {
  ingestarSap,
  type AjusteGasto,
  type FiltroCarga,
  type ResumenIngesta,
} from "@/lib/ingesta/sap";
import { parsearArchivoSap, type ResultadoSap } from "@/lib/sap/parser";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Tamaño máximo por archivo. Los exportables de SAP rondan 1-3 MB. */
const MAX_BYTES = 25 * 1024 * 1024;

/** Acepta sólo "YYYY-MM-DD"; cualquier otra cosa se trata como sin límite. */
function fechaOpcional(valor: FormDataEntryValue | null): string | null {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  return Number.isNaN(Date.parse(valor)) ? null : valor;
}

const textoOpcional = z.string().max(200).nullable().optional();

const ajustesSchema = z.record(
  z.string().regex(/^[0-9a-f]{32}$/),
  z.object({
    id_factura_preregistrada: z.string().uuid().nullable().optional(),
    asignacion: textoOpcional,
    fase: textoOpcional,
    motivo: textoOpcional,
    detalle: textoOpcional,
    id_encargado: z.string().uuid().nullable().optional(),
    estado: z.enum(["aprobado", "pendiente", "excluido"]).optional(),
  }),
);

/**
 * Carga de los exportables de SAP desde el asistente.
 *
 * - modo=plan: devuelve lo que se registraría, con las decisiones de los
 *   pasos 3 a 5 ya aplicadas. NO ESCRIBE NADA: el asistente lo llama cada vez
 *   que cambia de paso.
 * - modo=confirmar (por defecto): registra la carga con esas mismas
 *   decisiones. Es el botón "Confirmar y registrar" del resumen.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await createSupabaseServerClient();
    const auth = await requireApiPermiso(supabase, "cargas:sap");
    if ("response" in auth) return auth.response;

    const formData = await request.formData();
    const archivos = formData.getAll("archivos").filter((a): a is File => a instanceof File);
    const forzar = formData.get("forzar") === "true";
    const soloPlan = formData.get("modo") === "plan";

    let ajustes: Record<string, AjusteGasto> = {};
    const ajustesCrudos = formData.get("ajustes");
    if (typeof ajustesCrudos === "string" && ajustesCrudos !== "") {
      let json: unknown;
      try {
        json = JSON.parse(ajustesCrudos);
      } catch {
        return Response.json(
          { error: "Las decisiones del asistente son inválidas." },
          { status: 400 },
        );
      }
      const parsed = ajustesSchema.safeParse(json);
      if (!parsed.success) {
        return Response.json(
          { error: "Las decisiones del asistente son inválidas." },
          { status: 400 },
        );
      }
      ajustes = parsed.data;
    }

    const filtro: FiltroCarga = {
      desde: fechaOpcional(formData.get("desde")),
      hasta: fechaOpcional(formData.get("hasta")),
      omitirProbables: formData.get("omitirProbables") === "true",
    };

    if (filtro.desde !== null && filtro.hasta !== null && filtro.desde > filtro.hasta) {
      return Response.json(
        { error: "El rango de fechas está invertido: 'desde' es posterior a 'hasta'." },
        { status: 400 },
      );
    }

    if (archivos.length === 0) {
      return Response.json({ error: "No se recibió ningún archivo" }, { status: 400 });
    }

    if (soloPlan) {
      const parseados: Array<{ nombre: string; parseado: ResultadoSap }> = [];
      const errores: Array<{ archivo: string; motivo: string }> = [];
      for (const archivo of archivos) {
        if (archivo.size > MAX_BYTES) {
          errores.push({ archivo: archivo.name, motivo: "Supera el máximo de 25 MB" });
          continue;
        }
        try {
          const buffer = Buffer.from(await archivo.arrayBuffer());
          parseados.push({
            nombre: archivo.name,
            parseado: parsearArchivoSap(buffer, archivo.name),
          });
        } catch (e) {
          errores.push({
            archivo: archivo.name,
            motivo: e instanceof Error ? e.message : "Error desconocido al procesar",
          });
        }
      }
      const plan = await planificarCarga(supabase, parseados, filtro, ajustes);
      return Response.json({ plan, errores });
    }

    // Un lote por envío: los reportes de CeCo y de OI subidos juntos se
    // revisan juntos en el asistente de Triaje.
    const idLote = randomUUID();
    const resumenes: ResumenIngesta[] = [];
    const errores: Array<{ archivo: string; motivo: string }> = [];
    const yaCargados: Array<{ archivo: string; cargadoEl: string }> = [];

    for (const archivo of archivos) {
      if (archivo.size > MAX_BYTES) {
        errores.push({
          archivo: archivo.name,
          motivo: `Pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y el máximo es 25 MB`,
        });
        continue;
      }

      const buffer = Buffer.from(await archivo.arrayBuffer());
      const hash = createHash("sha256").update(buffer).digest("hex");

      // Evita reprocesar el mismo archivo sin querer.
      if (!forzar) {
        const { data: previa, error: errorPrevia } = await supabase
          .from("cargas")
          .select("created_at")
          .eq("hash_archivo", hash)
          .eq("estado", "completada")
          .limit(1)
          .maybeSingle();

        if (errorPrevia) {
          console.error("[POST /api/cargas/sap]", errorPrevia);
          errores.push({
            archivo: archivo.name,
            motivo: "No se pudo verificar si ya se había cargado.",
          });
          continue;
        }

        if (previa) {
          yaCargados.push({
            archivo: archivo.name,
            cargadoEl: previa.created_at as string,
          });
          continue;
        }
      }

      try {
        const parseado = parsearArchivoSap(buffer, archivo.name);
        resumenes.push(
          await ingestarSap(supabase, parseado, {
            nombreArchivo: archivo.name,
            hashArchivo: hash,
            idUsuario: auth.user.id,
            filtro,
            idLote,
            ajustes,
          }),
        );
      } catch (e) {
        errores.push({
          archivo: archivo.name,
          motivo: e instanceof Error ? e.message : "Error desconocido al procesar",
        });
      }
    }

    return Response.json({
      idLote: resumenes.length > 0 ? idLote : null,
      resumenes,
      errores,
      yaCargados,
    });
  } catch (error) {
    console.error("[POST /api/cargas/sap]", error);
    return Response.json({ error: "Error interno al procesar la carga" }, { status: 500 });
  }
}
