import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";
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
