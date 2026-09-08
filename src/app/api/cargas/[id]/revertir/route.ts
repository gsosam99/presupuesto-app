import { requireApiUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Deshacer una carga: borra los gastos que insertó.
 *
 * Dos reglas que hacen que esto sea seguro:
 *
 *  1. Sólo borra filas de ESA carga (gastos.id_carga), nunca por fecha ni por
 *     ningún otro criterio derivado.
 *  2. Las filas que ya pasó por triaje una persona (revisado_at no nulo) se
 *     respetan por defecto. Borrarlas también exige pedirlo explícitamente,
 *     porque ahí se pierde trabajo humano, no sólo datos importados.
 *
 * GET  -> cuántas filas se borrarían, sin tocar nada.
 * POST -> las borra y marca la carga como 'revertida' (no se elimina la fila
 *         de cargas: el historial tiene que seguir contando qué pasó).
 */

interface Carga {
  id: string;
  nombre_archivo: string;
  estado: string;
  created_at: string;
}

async function contar(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  idCarga: string,
): Promise<{ total: number; revisadas: number; intactas: number }> {
  const [todas, tocadas] = await Promise.all([
    supabase
      .from("gastos")
      .select("id", { count: "exact", head: true })
      .eq("id_carga", idCarga),
    supabase
      .from("gastos")
      .select("id", { count: "exact", head: true })
      .eq("id_carga", idCarga)
      .not("revisado_at", "is", null),
  ]);

  const total = todas.count ?? 0;
  const revisadas = tocadas.count ?? 0;
  return { total, revisadas, intactas: total - revisadas };
}

async function buscarCarga(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  id: string,
): Promise<Carga | null> {
  const { data } = await supabase
    .from("cargas")
    .select("id, nombre_archivo, estado, created_at")
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as Carga | null) ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const auth = await requireApiUser(supabase);
    if ("response" in auth) return auth.response;

    const carga = await buscarCarga(supabase, id);
    if (!carga) return Response.json({ error: "Carga no encontrada" }, { status: 404 });

    return Response.json({ carga, ...(await contar(supabase, id)) });
  } catch (error) {
    console.error("[GET /api/cargas/[id]/revertir]", error);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const auth = await requireApiUser(supabase);
    if ("response" in auth) return auth.response;

    const cuerpo = (await request.json().catch(() => ({}))) as {
      confirmacion?: unknown;
      incluirRevisadas?: unknown;
    };
    const incluirRevisadas = cuerpo.incluirRevisadas === true;

    const carga = await buscarCarga(supabase, id);
    if (!carga) return Response.json({ error: "Carga no encontrada" }, { status: 404 });

    if (carga.estado === "revertida") {
      return Response.json({ error: "Esta carga ya se revirtió." }, { status: 409 });
    }
    if (carga.estado !== "completada") {
      return Response.json(
        { error: `Sólo se pueden revertir cargas completadas (esta está "${carga.estado}").` },
        { status: 409 },
      );
    }

    // El nombre del archivo se escribe a mano en el modal: es la confirmación
    // de que se está deshaciendo la carga que se cree, y no otra de la lista.
    if (cuerpo.confirmacion !== carga.nombre_archivo) {
      return Response.json(
        { error: "La confirmación no coincide con el nombre del archivo." },
        { status: 400 },
      );
    }

    const antes = await contar(supabase, id);

    let consulta = supabase.from("gastos").delete().eq("id_carga", id);
    if (!incluirRevisadas) consulta = consulta.is("revisado_at", null);

    const { error: errorBorrado } = await consulta;
    if (errorBorrado) {
      console.error("[POST /api/cargas/[id]/revertir]", errorBorrado);
      return Response.json(
        { error: `No se pudieron borrar los gastos: ${errorBorrado.message}` },
        { status: 500 },
      );
    }

    const despues = await contar(supabase, id);
    const borradas = antes.total - despues.total;

    const nota =
      `Revertida: se borraron ${borradas} de ${antes.total} filas` +
      (despues.total > 0
        ? `. Quedaron ${despues.total} que ya habían pasado por triaje.`
        : ".");

    const { error: errorEstado } = await supabase
      .from("cargas")
      .update({
        // Si sobrevivieron filas revisadas la carga NO está del todo deshecha,
        // así que sigue 'completada' con la nota; marcarla revertida mentiría.
        estado: despues.total === 0 ? "revertida" : "completada",
        revertida_at: new Date().toISOString(),
        revertida_por: auth.user.id,
        mensaje: nota,
      })
      .eq("id", id);

    if (errorEstado) console.error("[POST /api/cargas/[id]/revertir]", errorEstado);

    return Response.json({
      borradas,
      restantes: despues.total,
      revisadasConservadas: incluirRevisadas ? 0 : despues.total,
    });
  } catch (error) {
    console.error("[POST /api/cargas/[id]/revertir]", error);
    return Response.json({ error: "Error interno al revertir la carga" }, { status: 500 });
  }
}
