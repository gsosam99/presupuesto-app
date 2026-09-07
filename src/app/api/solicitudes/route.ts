import { z } from "zod";

import { requireApiUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const lineaSchema = z.object({
  mes: z.number().int().min(1).max(12),
  monto: z.number().positive(),
  cuenta_contable: z.string().nullable().optional(),
  descripcion_cuenta: z.string().nullable().optional(),
  tipo_gasto: z.string().nullable().optional(),
  detalle_gasto: z.string().nullable().optional(),
  responsable: z.string().nullable().optional(),
});

const cuerpoSchema = z
  .object({
    tipo: z.enum(["extra_plan", "prorroga"]),
    id_oi: z.string().nullable().optional(),
    id_ceco: z.string().nullable().optional(),
    fy: z.number(),
    trimestre: z.number().nullable().optional(),
    titulo: z.string().trim().min(1, "La solicitud necesita un título"),
    justificacion: z.string().nullable().optional(),
    monto_solicitado: z.number().nullable().optional(),
    lineas: z.array(lineaSchema).optional(),
  })
  .superRefine((cuerpo, ctx) => {
    if (!cuerpo.id_oi && !cuerpo.id_ceco) {
      ctx.addIssue({
        code: "custom",
        message: "Indica la Orden Interna (o el Centro de Costo) afectado",
      });
    }
    if (cuerpo.tipo === "extra_plan" && (cuerpo.lineas ?? []).length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "El extra plan necesita al menos una línea con mes y monto",
      });
    }
    if (cuerpo.tipo === "prorroga") {
      if (!cuerpo.trimestre) {
        ctx.addIssue({
          code: "custom",
          message: "La prórroga necesita el trimestre cuyo sobrante quieres conservar",
        });
      }
      if (!cuerpo.monto_solicitado || cuerpo.monto_solicitado <= 0) {
        ctx.addIssue({ code: "custom", message: "Indica el monto a conservar" });
      }
    }
  });

/** Alta de una solicitud (extra plan o prórroga). Nace siempre en borrador. */
export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await createSupabaseServerClient();
    const auth = await requireApiUser(supabase);
    if ("response" in auth) return auth.response;

    const parsed = cuerpoSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 },
      );
    }
    const cuerpo = parsed.data;
    const tipo = cuerpo.tipo;
    const lineas = cuerpo.lineas ?? [];

    const { data: solicitud, error } = await supabase
      .from("solicitudes")
      .insert({
        tipo,
        estado: "borrador",
        id_oi: cuerpo.id_oi ?? null,
        id_ceco: cuerpo.id_ceco ?? null,
        fy: cuerpo.fy,
        trimestre: tipo === "prorroga" ? cuerpo.trimestre : null,
        titulo: cuerpo.titulo,
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
      console.error("[POST /api/solicitudes]", error);
      return Response.json({ error: "No se pudo crear la solicitud." }, { status: 400 });
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
        const { error: errorBorrado } = await supabase
          .from("solicitudes")
          .delete()
          .eq("id", solicitud.id as string);
        if (errorBorrado) console.error("[POST /api/solicitudes] limpieza", errorBorrado);

        console.error("[POST /api/solicitudes]", errorLineas);
        return Response.json(
          { error: "No se pudieron guardar las líneas de la solicitud." },
          { status: 400 },
        );
      }
    }

    return Response.json({ id: solicitud.id }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/solicitudes]", error);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
