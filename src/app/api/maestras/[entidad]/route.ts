import { z } from "zod";

import { requireApiPermiso } from "@/lib/auth";
import { invitar } from "@/lib/equipo/accesos";
import type { Permiso } from "@/lib/permisos";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * CRUD de tablas maestras.
 *
 * Cada entidad declara qué columnas se pueden escribir: así la ruta es genérica
 * sin volverse un pasamanos que deje modificar cualquier campo.
 */
const ENTIDADES: Record<string, { tabla: string; campos: string[]; permiso?: Permiso }> = {
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
  // Es a la vez el catálogo de encargados y la tabla de usuarios: asignar un
  // rol es dar acceso, por eso tiene su propio permiso.
  "miembros-equipo": {
    tabla: "miembros_equipo",
    campos: ["nombre", "correo", "rol", "activo"],
    permiso: "equipo:editar",
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
    // El enlace con la sesión es por correo: se guarda normalizado.
    if (campo === "correo" && typeof salida[campo] === "string") {
      salida[campo] = (salida[campo] as string).trim().toLowerCase();
    }
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
    const auth = await requireApiPermiso(supabase, config.permiso ?? "maestras:editar");
    if ("response" in auth) return auth.response;

    const parsed = registroSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const registro = limpiar(parsed.data, config.campos);
    const { data, error } = await supabase
      .from(config.tabla)
      .insert(registro)
      .select("id")
      .single();

    if (error) {
      console.error("[POST /api/maestras]", error);
      return Response.json({ error: "No se pudo crear el registro." }, { status: 400 });
    }

    // Un miembro nuevo con rol es un usuario nuevo: se le crea la cuenta en
    // Supabase Auth y le llega la invitación. Si falla, el miembro queda
    // creado igual y se reintenta desde la columna "Acceso".
    let invitacion: string | null = null;
    if (
      entidad === "miembros-equipo" &&
      registro.rol &&
      registro.activo !== false &&
      typeof registro.correo === "string"
    ) {
      try {
        const resultado = await invitar(registro.correo, new URL(request.url).origin);
        invitacion = resultado.ok
          ? `Invitación enviada a ${registro.correo}.`
          : `El miembro se creó, pero la invitación falló: ${resultado.error}`;
      } catch (e) {
        console.error("[POST /api/maestras] invitación", e);
        invitacion = "El miembro se creó, pero no se pudo enviar la invitación.";
      }
    }

    return Response.json({ id: data?.id, invitacion }, { status: 201 });
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
    const auth = await requireApiPermiso(supabase, config.permiso ?? "maestras:editar");
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
