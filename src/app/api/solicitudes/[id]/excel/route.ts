import { requireApiUser } from "@/lib/auth";
import {
  generarExcelExtraPlan,
  nombreArchivoExtraPlan,
  type LineaExtraPlan,
} from "@/lib/export/extraPlanExcel";
import {
  generarExcelMovimiento,
  nombreArchivoMovimiento,
  type LineaMovimiento,
} from "@/lib/export/movimientoFondosExcel";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function descarga(buffer: Buffer, nombre: string): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX,
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Descarga el Excel para finanzas: el formato estándar de Extra Plan, o una
 * tabla simple para reclasificación y ahorro. La provisión no lleva archivo:
 * se informa con el monto y el trimestre de la solicitud.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const auth = await requireApiUser(supabase);
    if ("response" in auth) return auth.response;

    const { data: solicitud, error } = await supabase
      .from("solicitudes")
      .select("id, tipo, titulo, justificacion, fy, id_oi, id_ceco, id_oi_destino, id_ceco_destino")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[GET /api/solicitudes/:id/excel]", error);
      return Response.json({ error: "No se pudo leer la solicitud." }, { status: 400 });
    }
    if (!solicitud) return Response.json({ error: "No existe" }, { status: 404 });
    if (solicitud.tipo === "reclasificacion" || solicitud.tipo === "ahorro") {
      return await excelMovimiento(supabase, {
        id,
        tipo: solicitud.tipo,
        titulo: solicitud.titulo as string,
        justificacion: (solicitud.justificacion as string | null) ?? null,
        fy: Number(solicitud.fy),
        idOi: solicitud.id_oi,
        idCeco: solicitud.id_ceco,
        idOiDestino: solicitud.id_oi_destino,
        idCecoDestino: solicitud.id_ceco_destino,
      });
    }
    if (solicitud.tipo !== "extra_plan") {
      return Response.json(
        { error: "Este tipo de solicitud no genera archivo para finanzas" },
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
      const { data: cecoOi, error: errorCecoOi } = await supabase
        .from("cecos")
        .select("codigo_sap")
        .eq("id", oi.data.id_ceco as string)
        .maybeSingle();
      if (errorCecoOi) console.error("[GET /api/solicitudes/:id/excel]", errorCecoOi);
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

    return descarga(buffer, nombre);
  } catch (error) {
    console.error("[GET /api/solicitudes/:id/excel]", error);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}

/** Código legible de una unidad: la OI o, si no tiene, el CeCo. */
async function codigoUnidad(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  idOi: string | null,
  idCeco: string | null,
): Promise<string> {
  if (idOi) {
    const { data } = await supabase
      .from("ordenes_internas")
      .select("codigo_oi")
      .eq("id", idOi)
      .maybeSingle();
    return data?.codigo_oi ?? "—";
  }
  if (idCeco) {
    const { data } = await supabase.from("cecos").select("codigo_sap").eq("id", idCeco).maybeSingle();
    return data?.codigo_sap ?? "—";
  }
  return "—";
}

async function excelMovimiento(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  s: {
    id: string;
    tipo: "reclasificacion" | "ahorro";
    titulo: string;
    justificacion: string | null;
    fy: number;
    idOi: string | null;
    idCeco: string | null;
    idOiDestino: string | null;
    idCecoDestino: string | null;
  },
): Promise<Response> {
  const [lineas, origen, destino] = await Promise.all([
    supabase
      .from("solicitud_lineas")
      .select("mes, monto, detalle_gasto")
      .eq("id_solicitud", s.id)
      .order("mes"),
    codigoUnidad(supabase, s.idOi, s.idCeco),
    s.tipo === "reclasificacion"
      ? codigoUnidad(supabase, s.idOiDestino, s.idCecoDestino)
      : Promise.resolve(null),
  ]);

  if (lineas.error) {
    console.error("[GET /api/solicitudes/:id/excel]", lineas.error);
    return Response.json({ error: "No se pudieron leer las líneas." }, { status: 400 });
  }

  const buffer = await generarExcelMovimiento({
    tipo: s.tipo,
    origen,
    destino,
    fy: s.fy,
    titulo: s.titulo,
    justificacion: s.justificacion,
    lineas: ((lineas.data ?? []) as unknown as LineaMovimiento[]).map((l) => ({
      ...l,
      monto: Number(l.monto),
    })),
  });

  return descarga(buffer, nombreArchivoMovimiento(s.tipo, origen, s.fy));
}
