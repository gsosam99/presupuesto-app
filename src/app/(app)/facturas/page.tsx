import {
  TablaFacturas,
  type FiltroEstado,
  type OpcionesEdicion,
} from "@/components/facturas/TablaFacturas";
import { PestanasNav } from "@/components/ui/PestanasNav";
import { requireRol } from "@/lib/auth";
import { obtenerFacturasDelFy } from "@/lib/facturas/consultas";
import { obtenerOpcionesFormulario } from "@/lib/facturas/opciones";
import { etiquetaTrimestre, fyEtiqueta, trimestreActual } from "@/lib/fiscal";
import { obtenerFySeleccionado } from "@/lib/fiscal-seleccionado";
import { tienePermiso } from "@/lib/permisos";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Facturas — IENN Gastos App" };
export const dynamic = "force-dynamic";

const ESTADOS: readonly FiltroEstado[] = ["todas", "cruzadas", "sin_cruzar"];

export default async function FacturasPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { rol } = await requireRol();
  const puedeEditar = tienePermiso(rol, "facturas:editar");
  const { estado } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const fy = await obtenerFySeleccionado();

  const [facturas, opciones] = await Promise.all([
    obtenerFacturasDelFy(supabase, fy),
    // Los catálogos del formulario solo hacen falta si se puede editar.
    puedeEditar ? obtenerOpcionesFormulario(supabase, fy) : Promise.resolve(null),
  ]);

  const edicion: OpcionesEdicion | null = opciones
    ? { ...opciones, trimestreActual: etiquetaTrimestre(trimestreActual()) }
    : null;

  const errorCarga = facturas.error ?? opciones?.error ?? null;

  return (
    <main className="mx-auto w-full max-w-[1400px] px-5 py-8">
      <header>
        <p className="ui-eyebrow">Gastos · FY {fyEtiqueta(fy)}</p>
        <h1 className="ui-title">Facturas pre-registradas</h1>
        <p className="ui-lead">
          Cada factura se registra a medida que llega a finanzas. Cuando se carga el reporte de SAP,
          el cruce por número de factura le aplica al gasto la Orden Interna, la taxonomía y el
          encargado definidos acá.
        </p>
      </header>

      {puedeEditar && (
        <PestanasNav
          etiqueta="Facturas"
          className="mt-6"
          activa="/facturas"
          pestanas={[
            { href: "/facturas", etiqueta: "Facturas registradas" },
            { href: "/facturas/nueva", etiqueta: "Registrar facturas" },
          ]}
        />
      )}

      {errorCarga && (
        <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          No se pudo cargar toda la información: {errorCarga}
        </p>
      )}

      <section className="mt-6">
        <TablaFacturas
          filas={facturas.data}
          edicion={edicion}
          estadoInicial={ESTADOS.find((e) => e === estado) ?? "todas"}
        />
      </section>
    </main>
  );
}
