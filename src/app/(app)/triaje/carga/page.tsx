import { AsistenteCarga } from "@/components/triaje/asistente/AsistenteCarga";
import { PestanasTriaje } from "@/components/triaje/PestanasTriaje";
import { requireRol } from "@/lib/auth";

export const metadata = { title: "Nueva carga SAP — IENN Gastos App" };
export const dynamic = "force-dynamic";

export default async function NuevaCargaPage() {
  await requireRol("cargas:sap");

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Nueva carga SAP</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Carga los exportables mensuales de SAP (Centro de Costo y Orden Interna) y crúzalos con
          las facturas pre-registradas. Primero revisas qué trae el archivo y acotas las fechas;
          después ves qué cruzó solo, resuelves a mano lo que no, y completas las rezagadas.
        </p>
      </header>

      <PestanasTriaje activa="/triaje/carga" puedeCargar />

      <div className="mt-6">
        <AsistenteCarga />
      </div>
    </main>
  );
}
