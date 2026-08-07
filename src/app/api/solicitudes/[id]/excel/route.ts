import {
  generarExcelExtraPlan,
  nombreArchivoExtraPlan,
  type LineaExtraPlan,
} from "@/lib/export/extraPlanExcel";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Descarga el Excel de Extra Plan listo para enviar a finanzas. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return Response.json({ error: "No autenticado" }, { status: 401 });

    const { data: solicitud, error } = await supabase
      .from("solicitudes")
      .select("id, tipo, titulo, justificacion, fy, id_oi, id_ceco")
      .eq("id", id)
      .maybeSingle();

    if (error) return Response.json({ error: error.message }, { status: 400 });
    if (!solicitud) return Response.json({ error: "No existe" }, { status: 404 });
    if (solicitud.tipo !== "extra_plan") {
      return Response.json(
        { error: "Solo las solicitudes de extra plan generan archivo para finanzas" },
        { status: 400 },
      );
    }

    const [lineas, oi, ceco] = await Promise.all([
      supabase
        .from("solicitud_lineas")
        .select("mes, monto, cuenta_contable, descripcion_cuenta, tipo_gasto, detalle_gasto, responsable")
        .eq("id_solicitud", id)
        .order("mes"),
      solicitud.id_oi
        ? supabase
            .from("ordenes_internas")
            .select("codigo_oi, nombre, id_ceco")
            .eq("id", solicitud.id_oi)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      solicitud.id_ceco
        ? supabase
            .from("cecos")
            .select("codigo_sap")
            .eq("id", solicitud.id_ceco)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    // El CeCo del encabezado sale de la OI cuando la maestra lo tiene resuelto.
    let cecoDeclarado: string | null = (ceco.data?.codigo_sap as string | null) ?? null;
    if (!cecoDeclarado && oi.data?.id_ceco) {
      const { data: cecoOi } = await supabase
        .from("cecos")
        .select("codigo_sap")
        .eq("id", oi.data.id_ceco as string)
        .maybeSingle();
      cecoDeclarado = (cecoOi?.codigo_sap as string | null) ?? null;
    }

    const buffer = await generarExcelExtraPlan({
      codigoOi: (oi.data?.codigo_oi as string) ?? cecoDeclarado ?? "—",
      cecoDeclarado,
      area: (oi.data?.nombre as string | null) ?? null,
      fy: Number(solicitud.fy),
      titulo: solicitud.titulo as string,
      justificacion: (solicitud.justificacion as string | null) ?? null,
      lineas: (lineas.data ?? []) as unknown as LineaExtraPlan[],
    });

    const nombre = nombreArchivoExtraPlan(
      (oi.data?.codigo_oi as string) ?? "solicitud",
      Number(solicitud.fy),
    );

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nombre}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[GET /api/solicitudes/:id/excel]", error);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
