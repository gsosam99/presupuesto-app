import { z } from "zod";

import { requireApiPermiso } from "@/lib/auth";
import { trimestreIniciado } from "@/lib/fiscal";
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

/** Tipos que se piden por líneas de mes + monto. */
const TIPOS_CON_LINEAS: ReadonlySet<string> = new Set(["extra_plan", "reclasificacion", "ahorro"]);

const cuerpoSchema = z
  .object({
    tipo: z.enum(["extra_plan", "reclasificacion", "provision", "ahorro"]),
    id_oi: z.string().nullable().optional(),
    id_ceco: z.string().nullable().optional(),
    /** Solo reclasificación: la unidad que recibe los fondos. */
    id_oi_destino: z.string().nullable().optional(),
    id_ceco_destino: z.string().nullable().optional(),
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
    if (TIPOS_CON_LINEAS.has(cuerpo.tipo) && (cuerpo.lineas ?? []).length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "La solicitud necesita al menos una línea con mes y monto",
      });
    }
    if (cuerpo.tipo === "reclasificacion") {
      const origen = cuerpo.id_oi ?? cuerpo.id_ceco;
      const destino = cuerpo.id_oi_destino ?? cuerpo.id_ceco_destino;
      if (!destino) {
        ctx.addIssue({ code: "custom", message: "Indica la Orden Interna de destino" });
      } else if (destino === origen) {
        ctx.addIssue({ code: "custom", message: "El origen y el destino deben ser distintos" });
      }
    }
    if (cuerpo.tipo === "provision") {
      if (!cuerpo.trimestre) {
        ctx.addIssue({
          code: "custom",
          message: "La provisión necesita el trimestre que se provisiona",
        });
      }
      if (!cuerpo.monto_solicitado || cuerpo.monto_solicitado <= 0) {
        ctx.addIssue({ code: "custom", message: "Indica el monto a provisionar" });
      }
      // Un trimestre que todavía no empezó no tiene servicios recibidos que
      // provisionar: se declara sobre el trimestre en curso o uno cerrado.
      if (cuerpo.trimestre && !trimestreIniciado(cuerpo.fy, cuerpo.trimestre)) {
        ctx.addIssue({
          code: "custom",
          message:
            "Ese trimestre todavía no empezó: la provisión se declara sobre el trimestre en curso o uno cerrado",
        });
      }
    }
  });

/** Alta de una solicitud. Nace siempre en borrador. */
export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await createSupabaseServerClient();
    const auth = await requireApiPermiso(supabase, "solicitudes:crear");
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
        id_oi_destino: tipo === "reclasificacion" ? (cuerpo.id_oi_destino ?? null) : null,
        id_ceco_destino: tipo === "reclasificacion" ? (cuerpo.id_ceco_destino ?? null) : null,
        trimestre: tipo === "provision" ? cuerpo.trimestre : null,
        titulo: cuerpo.titulo,
        justificacion: cuerpo.justificacion?.trim() || null,
        monto_solicitado:
          tipo === "provision"
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

    if (TIPOS_CON_LINEAS.has(tipo)) {
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
