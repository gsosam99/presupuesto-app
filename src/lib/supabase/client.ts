import { createBrowserClient } from "@supabase/ssr";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import type { Database } from "@/types/supabase";

/**
 * Cliente Supabase para Client Components.
 * Usar dentro de `useMemo` para no recrearlo en cada render:
 *   const supabase = useMemo(() => createSupabaseBrowserClient(), []);
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
}
