import { requireApiUser } from "@/lib/auth";
import { obtenerDatosDashboard } from "@/lib/dashboard/datos";
import {
  generarHtmlDashboard,
  nombreArchivoExport,
  type DatosExport,
} from "@/lib/export/dashboardHtml";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Flujo E — descarga del dashboard como HTML interactivo y offline. */
export async function GET(): Promise<Response> {
  try {
    const supabase = await createSupabaseServerClient();
    const auth = await requireApiUser(supabase);
    if ("response" in auth) return auth.response;

    const datos = await obtenerDatosDashboard(supabase);

    // El original consume los registros como arreglos posicionales.
    const paraExport: DatosExport = {
      anios: datos.anios,
      currentFY: datos.currentFY,
      fyStartMonth: 10,
      fases: datos.fases,
      hzs: datos.hzs,
      hzOrdenPaleta: datos.hzOrdenPaleta,
      monthlyCurrent: datos.monthlyCurrent,
      asof: datos.asof,
      records: datos.records.map((r) => [
        r.af,
        r.fase,
        r.hz,
        r.motivo,
        r.detalle,
        r.monto,
        r.n,
      ]),
      ingresos: datos.ingresos.map((r) => [
        r.af,
        r.fase,
        r.hz,
        r.motivo,
        r.detalle,
        r.monto,
        r.n,
        r.concepto,
      ]),
      monthlyIncomeCurrent: datos.monthlyIncomeCurrent,
    };

    const html = await generarHtmlDashboard(paraExport);

    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nombreArchivoExport(datos.asof)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[GET /api/exportar/dashboard]", error);
    return Response.json({ error: "No se pudo generar el export." }, { status: 500 });
  }
}
