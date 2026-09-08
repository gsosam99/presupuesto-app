import { Sidebar } from "@/components/nav/Sidebar";
import { requireAuth } from "@/lib/auth";
import { obtenerFySeleccionado } from "@/lib/fiscal-seleccionado";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const usuario = await requireAuth();
  const supabase = await createSupabaseServerClient();

  const [fySeleccionado, anios] = await Promise.all([
    obtenerFySeleccionado(),
    supabase
      .from("v_anios_fiscales")
      .select("fy, etiqueta")
      .eq("activo", true)
      .order("fy", { ascending: false }),
  ]);

  return (
    <div className="flex min-h-svh flex-col lg:flex-row">
      <Sidebar
        usuario={{ email: usuario.email ?? "" }}
        aniosFiscales={(anios.data ?? []) as Array<{ fy: number; etiqueta: string }>}
        fySeleccionado={fySeleccionado}
      />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
