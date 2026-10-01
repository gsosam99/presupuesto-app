import { FormularioInvitacion } from "@/components/auth/FormularioInvitacion";

// También recibe el enlace de "olvidé mi contraseña": el título no asume cuál.
export const metadata = { title: "Elegir contraseña — IENN Gastos App" };

export default function InvitacionPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <header className="mb-8">
        <p className="text-sm font-medium tracking-wide text-slate-500">
          Innovación y Nuevos Negocios
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">IENN Gastos App</h1>
      </header>

      <FormularioInvitacion />
    </main>
  );
}
