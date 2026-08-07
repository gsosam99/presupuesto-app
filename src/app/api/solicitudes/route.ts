import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TipoSolicitud } from "@/types";

export const runtime = "nodejs";

interface LineaEntrada {
  mes?: number;
  monto?: number;
  cuenta_contable?: string | null;
  descripcion_cuenta?: string | null;
  tipo_gasto?: string | null;
  detalle_gasto?: string | null;
  responsable?: string | null;
}

interface Cuerpo {
  tipo?: TipoSolicitud;
  id_oi?: string | null;
  id_ceco?: string | null;
  fy?: number;
  trimestre?: number | null;
  titulo?: string;
  justificacion?: string | null;
  monto_solicitado?: number | null;
  lineas?: LineaEntrada[];
}

/** Alta de una solicitud (extra plan o prórroga). Nace siempre en borrador. */
export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return Response.json({ error: "No autenticado" }, { status: 401 });

    const cuerpo = (await request.json()) as Cuerpo;
    const tipo = cuerpo.tipo;

    if (tipo !== "extra_plan" && tipo !== "prorroga") {
      return Response.json({ error: "Tipo de solicitud inválido" }, { status: 400 });
    }
    if (!cuerpo.id_oi && !cuerpo.id_ceco) {
      return Response.json(
        { error: "Indica la Orden Interna (o el Centro de Costo) afectado" },
        { status: 400 },
      );
    }
    if (!cuerpo.fy) {
      return Response.json({ error: "Falta el año fiscal" }, { status: 400 });
    }
    const titulo = cuerpo.titulo?.trim();
    if (!titulo) {
      return Response.json({ error: "La solicitud necesita un título" }, { status: 400 });
    }

    const lineas = (cuerpo.lineas ?? []).filter(
      (l): l is Required<Pick<LineaEntrada, "mes" | "monto">> & LineaEntrada =>
        typeof l.mes === "number" && typeof l.monto === "number" && l.monto > 0,
    );

    if (tipo === "extra_plan" && lineas.length === 0) {
      return Response.json(
        { error: "El extra plan necesita al menos una línea con mes y monto" },
        { status: 400 },
      );
    }
    if (tipo === "prorroga") {
      if (!cuerpo.trimestre) {
        return Response.json(
          { error: "La prórroga necesita el trimestre cuyo sobrante quieres conservar" },
          { status: 400 },
        );
      }
      if (!cuerpo.monto_solicitado || cuerpo.monto_solicitado <= 0) {
        return Response.json({ error: "Indica el monto a conservar" }, { status: 400 });
      }
    }

    const { data: solicitud, error } = await supabase
      .from("solicitudes")
      .insert({
        tipo,
        estado: "borrador",
        id_oi: cuerpo.id_oi ?? null,
        id_ceco: cuerpo.id_ceco ?? null,
        fy: cuerpo.fy,
        trimestre: tipo === "prorroga" ? cuerpo.trimestre : null,
        titulo,
        justificacion: cuerpo.justificacion?.trim() || null,
        monto_solicitado:
          tipo === "prorroga"
            ? cuerpo.monto_solicitado
            : lineas.reduce((s, l) => s + l.monto, 0),
        creada_por: auth.user.id,
      })
      .select("id")
      .single();

    if (error || !solicitud) {
      return Response.json({ error: error?.message ?? "No se pudo crear" }, { status: 400 });
    }

    if (tipo === "extra_plan") {
      const { error: errorLineas } = await supabase.from("solicitud_lineas").insert(
        lineas.map((l) => ({
          id_solicitud: solicitud.id as string,
          mes: l.mes,
          monto: l.monto,
          cuenta_contable: l.cuenta_contable?.trim() || null,
          descripcion_cuenta: l.descripcion_cuenta?.trim() || null,
          tipo_gasto: l.tipo_gasto?.trim() || null,
          detalle_gasto: l.detalle_gasto?.trim() || null,
          responsable: l.responsable?.trim() || null,
        })),
      );

      if (errorLineas) {
        // Sin líneas la solicitud no sirve: se descarta para no dejar basura.
        await supabase.from("solicitudes").delete().eq("id", solicitud.id as string);
        return Response.json({ error: errorLineas.message }, { status: 400 });
      }
    }

    return Response.json({ id: solicitud.id }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/solicitudes]", error);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
