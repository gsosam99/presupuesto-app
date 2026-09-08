import { requireApiUser } from "@/lib/auth";
import { previsualizarArchivos, type ArchivoPrevio } from "@/lib/ingesta/previsualizacion";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Mismo límite que la carga real: los exportables de SAP rondan 1-3 MB. */
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Analiza los archivos y devuelve qué entraría, SIN escribir nada.
 * La carga real vive en ../route.ts y vuelve a calcular todo del lado del
 * servidor: lo que se decide acá es informativo, nunca la fuente de verdad.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await createSupabaseServerClient();
    const auth = await requireApiUser(supabase);
    if ("response" in auth) return auth.response;

    const formData = await request.formData();
    const archivos = formData.getAll("archivos").filter((a): a is File => a instanceof File);

    if (archivos.length === 0) {
      return Response.json({ error: "No se recibió ningún archivo" }, { status: 400 });
    }

    const excedidos = archivos.filter((a) => a.size > MAX_BYTES);
    if (excedidos.length > 0) {
      return Response.json(
        { error: `Archivos por encima de 25 MB: ${excedidos.map((a) => a.name).join(", ")}` },
        { status: 400 },
      );
    }

    const entrada = await Promise.all(
      archivos.map(async (a) => ({
        nombre: a.name,
        buffer: Buffer.from(await a.arrayBuffer()),
      })),
    );

    const previas: ArchivoPrevio[] = await previsualizarArchivos(supabase, entrada);
    return Response.json({ previas });
  } catch (error) {
    console.error("[POST /api/cargas/sap/previsualizar]", error);
    return Response.json({ error: "Error interno al analizar la carga" }, { status: 500 });
  }
}
