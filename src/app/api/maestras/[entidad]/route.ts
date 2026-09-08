import { z } from "zod";

import { requireApiUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * CRUD de tablas maestras.
 *
 * Cada entidad declara qué columnas se pueden escribir: así la ruta es genérica
 * sin volverse un pasamanos que deje modificar cualquier campo.
 */
const ENTIDADES: Record<string, { tabla: string; campos: string[] }> = {
  "ordenes-internas": {
    tabla: "ordenes_internas",
    campos: [
      "codigo_oi",
      "nombre",
      "tipo",
      "id_ceco",
      "id_hunting_zone",
      "vigencia_desde",
      "vigencia_hasta",
      "activo",
    ],
  },
  "hunting-zones": {
    tabla: "hunting_zones",
    campos: [
      "nombre",
      "tag_principal",
      "color_hex",
      "orden_display",
      "archivar_automatico",
      "activo",
    ],
  },
  cecos: {
    tabla: "cecos",
    campos: ["codigo_sap", "nombre", "usa_proyectos", "activo"],
  },
  "anios-fiscales": {
    tabla: "anios_fiscales",
    campos: ["fy", "activo"],
  },
};

type Registro = Record<string, string | number | boolean | null>;

/** Cualquier objeto plano de valores primitivos: el allowlist de ENTIDADES decide qué campo importa. */
const registroSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));

/** Deja pasar solo los campos declarados y normaliza las cadenas vacías. */
function limpiar(cuerpo: Registro, campos: string[]): Registro {
  const salida: Registro = {};
  for (const campo of campos) {
    if (!(campo in cuerpo)) continue;
    const valor = cuerpo[campo];
    salida[campo] = typeof valor === "string" && valor.trim() === "" ? null : valor;
  }
  return salida;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ entidad: string }> },
): Promise<Response> {
  try {
    const { entidad } = await params;
    const config = ENTIDADES[entidad];
    if (!config) return Response.json({ error: "Entidad desconocida" }, { status: 404 });

    const supabase = await createSupabaseServerClient();
    const auth = await requireApiUser(supabase);
    if ("response" in auth) return auth.response;

    const parsed = registroSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from(config.tabla)
      .insert(limpiar(parsed.data, config.campos))
      .select("id")
      .single();

    if (error) {
      console.error("[POST /api/maestras]", error);
      return Response.json({ error: "No se pudo crear el registro." }, { status: 400 });
    }
    return Response.json({ id: data?.id }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/maestras]", error);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ entidad: string }> },
): Promise<Response> {
  try {
    const { entidad } = await params;
    const config = ENTIDADES[entidad];
    if (!config) return Response.json({ error: "Entidad desconocida" }, { status: 404 });

    const supabase = await createSupabaseServerClient();
    const auth = await requireApiUser(supabase);
    if ("response" in auth) return auth.response;

    const parsed = registroSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "Datos inválidos" }, { status: 400 });
    }
    const cuerpo = parsed.data;
    const id = typeof cuerpo.id === "string" ? cuerpo.id : undefined;
    if (!id) return Response.json({ error: "Falta el id" }, { status: 400 });

    const cambios = limpiar(cuerpo, config.campos);
    if (Object.keys(cambios).length === 0) {
      return Response.json({ error: "No hay cambios que aplicar" }, { status: 400 });
    }

    const { error } = await supabase.from(config.tabla).update(cambios).eq("id", id);

    if (error) {
      console.error("[PATCH /api/maestras]", error);
      return Response.json({ error: "No se pudo guardar el cambio." }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[PATCH /api/maestras]", error);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
