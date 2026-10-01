import { AsistenteCarga } from "@/components/triaje/asistente/AsistenteCarga";
import { PestanasTriaje } from "@/components/triaje/PestanasTriaje";
import { requireRol } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerCatalogosTriaje } from "@/lib/triaje/catalogos";
import { obtenerFacturasSinCruzar } from "@/lib/triaje/lote";

export const metadata = { title: "Nueva carga SAP — IENN Gastos App" };
export const dynamic = "force-dynamic";

export default async function NuevaCargaPage() {
  await requireRol("cargas:sap");

  // Lo que los pasos 4 (match manual) y 5 (rezagadas) necesitan: el asistente
  // corre en memoria hasta confirmar, así que se trae de una vez.
  const supabase = await createSupabaseServerClient();
  const [facturas, catalogos] = await Promise.all([
    obtenerFacturasSinCruzar(supabase),
    obtenerCatalogosTriaje(supabase),
  ]);
  const errorCarga = facturas.error ?? catalogos.error;

  return (
    <main className="mx-auto w-full max-w-[110rem] px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Nueva carga SAP</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Carga los exportables mensuales de SAP (Centro de Costo y Orden Interna) y crúzalos con
          las facturas pre-registradas. Revisas qué trae el archivo, acotas las fechas, ves qué
          cruzó solo, resuelves a mano lo que no y completas las rezagadas.{" "}
          <strong className="text-slate-900">
            Nada se registra hasta que confirmas en el resumen final.
          </strong>
        </p>
      </header>

      <PestanasTriaje activa="/triaje/carga" puedeCargar />

      {errorCarga && (
        <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          No se pudo cargar toda la información: {errorCarga}
        </p>
      )}

      <div className="mt-6">
        <AsistenteCarga
          facturas={facturas.data}
          asignaciones={catalogos.asignaciones}
          sugerencias={catalogos.sugerencias}
          encargados={catalogos.encargados}
        />
      </div>
    </main>
  );
}
