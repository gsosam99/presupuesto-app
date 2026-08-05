import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";

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
