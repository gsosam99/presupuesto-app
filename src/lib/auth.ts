import { cache } from "react";
import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { aRolApp, tienePermiso, type Permiso } from "@/lib/permisos";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { RolApp } from "@/types";
import type { Database } from "@/types/supabase";

/**
 * Exige sesión en un Server Component de ruta protegida.
 * Redirige a /login si no hay usuario autenticado.
 */
export async function requireAuth(): Promise<User> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login");
  }

  return data.user;
}

/** Devuelve el usuario si hay sesión, o null. No redirige. */
export async function getUsuarioActual(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

/**
 * Rol del usuario de la sesión, resuelto en la base por rol_actual() (enlace
 * por correo contra miembros_equipo). null = sin acceso.
 */
async function leerRol(supabase: SupabaseClient<Database>): Promise<RolApp | null> {
  const { data, error } = await supabase.rpc("rol_actual");
  if (error) {
    console.error("[rol_actual]", error);
    return null;
  }
  return aRolApp(data);
}

/** Una sola consulta de rol por request, aunque la pidan layout y página. */
export const obtenerRol = cache(async (): Promise<RolApp | null> => {
  const supabase = await createSupabaseServerClient();
  return leerRol(supabase);
});

/**
 * Exige sesión y rol en un Server Component. Sin rol → /sin-acceso.
 * Con `permiso`, además exige que el rol lo tenga.
 */
export async function requireRol(permiso?: Permiso): Promise<{ user: User; rol: RolApp }> {
  const user = await requireAuth();
  const rol = await obtenerRol();

  if (rol === null) redirect("/sin-acceso");
  if (permiso && !tienePermiso(rol, permiso)) redirect("/sin-acceso?motivo=permiso");

  return { user, rol };
}

/**
 * Exige sesión en un Route Handler. A diferencia de requireAuth(), no redirige
 * (una API no tiene a dónde navegar): devuelve el usuario o una Response 401
 * lista para retornar tal cual.
 *
 *   const auth = await requireApiUser(supabase);
 *   if ("response" in auth) return auth.response;
 *   // usar auth.user acá
 */
export async function requireApiUser(
  supabase: SupabaseClient<Database>,
): Promise<{ user: User } | { response: Response }> {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return { response: Response.json({ error: "No autenticado" }, { status: 401 }) };
  }

  return { user: data.user };
}

/**
 * Como requireApiUser(), y además exige que el rol tenga `permiso`: 403 si no.
 *
 *   const auth = await requireApiPermiso(supabase, "facturas:editar");
 *   if ("response" in auth) return auth.response;
 */
export async function requireApiPermiso(
  supabase: SupabaseClient<Database>,
  permiso: Permiso,
): Promise<{ user: User; rol: RolApp } | { response: Response }> {
  const auth = await requireApiUser(supabase);
  if ("response" in auth) return auth;

  const rol = await leerRol(supabase);
  if (!tienePermiso(rol, permiso)) {
    return {
      response: Response.json(
        { error: "Tu rol no tiene permiso para esta acción." },
        { status: 403 },
      ),
    };
  }

  return { user: auth.user, rol: rol ?? "lector" };
}
