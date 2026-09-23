import Link from "next/link";

import { BotonSalir } from "@/components/auth/BotonSalir";
import { obtenerRol, requireAuth } from "@/lib/auth";

export const metadata = { title: "Sin acceso — IENN Gastos App" };
export const dynamic = "force-dynamic";

/**
 * Destino de requireRol(): hay sesión, pero el correo no tiene rol en la
 * maestra de Equipo, o el rol no alcanza para la pantalla pedida. Vive fuera
 * del grupo (app) para que su layout no vuelva a redirigir acá.
 */
export default async function SinAccesoPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>;
}) {
  const usuario = await requireAuth();
  const rol = await obtenerRol();
  const { motivo } = await searchParams;
  const faltaPermiso = motivo === "permiso" && rol !== null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold text-slate-900">
        {faltaPermiso ? "Tu rol no permite esta pantalla" : "Todavía no tienes acceso"}
      </h1>
      <p className="mt-3 text-sm text-slate-600">
        {faltaPermiso ? (
          "Pídele a un administrador que revise tu rol en Configuración → Equipo."
        ) : (
          <>
            Iniciaste sesión como{" "}
            <span className="font-medium text-slate-900">{usuario.email}</span>, pero ese correo no
            tiene un rol asignado en la app. Pídele a un administrador que te agregue en
            Configuración → Equipo.
          </>
        )}
      </p>

      <div className="mt-8 flex items-center gap-4">
        {faltaPermiso && (
          <Link href="/dashboard" className="text-sm font-semibold text-slate-900 underline">
            Volver al dashboard
          </Link>
        )}
        <BotonSalir />
      </div>
    </main>
  );
}
