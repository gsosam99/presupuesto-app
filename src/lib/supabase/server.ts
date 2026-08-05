import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/types/supabase";

/**
 * Cliente Supabase para Server Components, Route Handlers y Server Actions.
 * La sesión viaja en cookies HTTP-only gestionadas por @supabase/ssr.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Los Server Components no pueden escribir cookies: el refresh de la
          // sesión lo resuelve src/proxy.ts. Ignorar es el patrón oficial.
        }
      },
    },
  });
}
