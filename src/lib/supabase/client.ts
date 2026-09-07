import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/types/supabase";

/**
 * Cliente Supabase para Client Components.
 * Usar dentro de `useMemo` para no recrearlo en cada render:
 *   const supabase = useMemo(() => createSupabaseBrowserClient(), []);
 */
export function createSupabaseBrowserClient(): SupabaseClient<Database> {
  return createBrowserClient<Database>(supabaseUrl(), supabaseAnonKey());
}
