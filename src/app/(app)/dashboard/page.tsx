import { DashboardIENN } from "@/components/dashboard/DashboardIENN";
import { obtenerDatosDashboard } from "@/lib/dashboard/datos";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import "./dashboard.css";

export const metadata = { title: "Dashboard — IENN Gastos App" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ presentacion?: string }>;
}) {
  const params = await searchParams;
  const enPresentacion = params.presentacion === "1";

  const supabase = await createSupabaseServerClient();
  const datos = await obtenerDatosDashboard(supabase);

  if (datos.records.length === 0) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16 text-center">
        <h1 className="ui-title">Dashboard</h1>
        <p className="ui-lead mx-auto">Todavía no hay gastos cargados para mostrar.</p>
      </main>
    );
  }

  return <DashboardIENN datos={datos} enPresentacion={enPresentacion} />;
}
