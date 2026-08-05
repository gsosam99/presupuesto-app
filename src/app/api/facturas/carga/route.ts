import { createHash } from "node:crypto";

import { importarFacturasExcel } from "@/lib/ingesta/facturas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 25 * 1024 * 1024;

/** Carga masiva de facturas pre-registradas desde Excel. */
export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return Response.json({ error: "No autenticado" }, { status: 401 });

    const formData = await request.formData();
    const archivo = formData.get("archivo");
    const forzar = formData.get("forzar") === "true";

    if (!(archivo instanceof File)) {
      return Response.json({ error: "No se recibió ningún archivo" }, { status: 400 });
    }
    if (archivo.size > MAX_BYTES) {
      return Response.json({ error: "El archivo supera los 25 MB" }, { status: 400 });
    }

    const buffer = Buffer.from(await archivo.arrayBuffer());
    const hash = createHash("sha256").update(buffer).digest("hex");

    // Verificación de duplicados: el mismo archivo no se reprocesa salvo que
    // el usuario lo pida explícitamente.
    if (!forzar) {
      const { data: previa } = await supabase
        .from("cargas")
        .select("created_at")
        .eq("hash_archivo", hash)
        .eq("estado", "completada")
        .limit(1)
        .maybeSingle();

      if (previa) {
        return Response.json(
          { yaCargado: { archivo: archivo.name, cargadoEl: previa.created_at } },
          { status: 409 },
        );
      }
    }

    const resumen = await importarFacturasExcel(supabase, buffer, {
      nombreArchivo: archivo.name,
      hashArchivo: hash,
      idUsuario: auth.user.id,
    });

    return Response.json({ resumen });
  } catch (error) {
    console.error("[POST /api/facturas/carga]", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 },
    );
  }
}
