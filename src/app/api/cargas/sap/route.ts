import { createHash } from "node:crypto";

import { requireApiUser } from "@/lib/auth";
import { ingestarSap, type ResumenIngesta } from "@/lib/ingesta/sap";
import { parsearArchivoSap } from "@/lib/sap/parser";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Tamaño máximo por archivo. Los exportables de SAP rondan 1-3 MB. */
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await createSupabaseServerClient();
    const auth = await requireApiUser(supabase);
    if ("response" in auth) return auth.response;

    const formData = await request.formData();
    const archivos = formData.getAll("archivos").filter((a): a is File => a instanceof File);
    const forzar = formData.get("forzar") === "true";

    if (archivos.length === 0) {
      return Response.json({ error: "No se recibió ningún archivo" }, { status: 400 });
    }

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
          }),
        );
      } catch (e) {
        errores.push({
          archivo: archivo.name,
          motivo: e instanceof Error ? e.message : "Error desconocido al procesar",
        });
      }
    }

    return Response.json({ resumenes, errores, yaCargados });
  } catch (error) {
    console.error("[POST /api/cargas/sap]", error);
    return Response.json({ error: "Error interno al procesar la carga" }, { status: 500 });
  }
}
