import { requireApiUser } from "@/lib/auth";
import { aRolApp, tienePermiso } from "@/lib/permisos";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Elimina una solicitud y sus líneas (on delete cascade).
 *
 * Borrar una solicitud APROBADA es deshacer algo que ya afectó los fondos, así
 * que exige el mismo permiso que aprobar. Si es un extra plan, primero se
 * borran las líneas que había cargado en presupuestos (lo mismo que hace
 * "Revertir aprobación"); reclasificación, provisión y ahorro no escriben en
 * otra tabla: fondos_mensuales() las lee de acá y desaparecen con la fila.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const auth = await requireApiUser(supabase);
    if ("response" in auth) return auth.response;

    const { data: solicitud, error: errorLectura } = await supabase
      .from("solicitudes")
      .select("id, tipo, estado")
      .eq("id", id)
      .maybeSingle();

    if (errorLectura) {
      console.error("[DELETE /api/solicitudes/:id]", errorLectura);
      return Response.json({ error: "No se pudo leer la solicitud." }, { status: 400 });
    }
    if (!solicitud) return Response.json({ error: "La solicitud no existe" }, { status: 404 });

    const aprobada = solicitud.estado === "aprobada";
    const { data: rol } = await supabase.rpc("rol_actual");
    const permiso = aprobada ? "solicitudes:resolver" : "solicitudes:crear";
    if (!tienePermiso(aRolApp(rol), permiso)) {
      return Response.json(
        {
          error: aprobada
            ? "Solo quien puede aprobar solicitudes puede eliminar una aprobada."
            : "Tu rol no tiene permiso para esta acción.",
        },
        { status: 403 },
      );
    }

    if (aprobada && solicitud.tipo === "extra_plan") {
      const { error: errorPresupuesto } = await supabase
        .from("presupuestos")
        .delete()
        .eq("id_solicitud", id);
      if (errorPresupuesto) {
        console.error("[DELETE /api/solicitudes/:id]", errorPresupuesto);
        return Response.json(
          { error: "No se pudo descargar el extra plan del presupuesto." },
          { status: 400 },
        );
      }
    }

    const { error } = await supabase.from("solicitudes").delete().eq("id", id);
    if (error) {
      console.error("[DELETE /api/solicitudes/:id]", error);
      return Response.json({ error: "No se pudo eliminar la solicitud." }, { status: 400 });
    }

    return Response.json({ eliminada: id });
  } catch (error) {
    console.error("[DELETE /api/solicitudes/:id]", error);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
