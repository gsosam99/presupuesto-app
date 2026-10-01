import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { supabaseServiceRoleKey, supabaseUrl } from "@/lib/env";

/**
 * Cliente con la clave secreta, para la API de administración de Auth
 * (invitar usuarios, ver su estado). Solo en Route Handlers y Server
 * Components, y siempre DESPUÉS de verificar el permiso del que llama:
 * este cliente no pasa por RLS.
 *
 * Sin tipos de Database a propósito: no se usa para leer tablas.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  return createClient(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
