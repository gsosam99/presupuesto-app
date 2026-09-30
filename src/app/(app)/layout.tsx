import { Sidebar } from "@/components/nav/Sidebar";
import { ProveedorAvisos } from "@/components/ui/Avisos";
import { requireRol } from "@/lib/auth";
import { obtenerFySeleccionado } from "@/lib/fiscal-seleccionado";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Sin rol en la maestra de Equipo no se entra a ninguna pantalla.
  const { user: usuario, rol } = await requireRol();
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
        usuario={{ email: usuario.email ?? "", rol }}
        aniosFiscales={(anios.data ?? []) as Array<{ fy: number; etiqueta: string }>}
        fySeleccionado={fySeleccionado}
      />
      <ProveedorAvisos>
        <main className="min-w-0 flex-1">{children}</main>
      </ProveedorAvisos>
    </div>
  );
}
