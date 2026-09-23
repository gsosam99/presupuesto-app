import { CargaMasivaFacturas } from "@/components/facturas/CargaMasivaFacturas";
import { FormularioFactura } from "@/components/facturas/FormularioFactura";
import { PestanasNav } from "@/components/ui/PestanasNav";
import { requireRol } from "@/lib/auth";
import { obtenerOpcionesFormulario } from "@/lib/facturas/opciones";
import { etiquetaTrimestre, fyEtiqueta, trimestreActual } from "@/lib/fiscal";
import { obtenerFySeleccionado } from "@/lib/fiscal-seleccionado";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Registrar facturas — IENN Gastos App" };
export const dynamic = "force-dynamic";

export default async function NuevaFacturaPage() {
  await requireRol("facturas:editar");

  const supabase = await createSupabaseServerClient();
  const fy = await obtenerFySeleccionado();
  const opciones = await obtenerOpcionesFormulario(supabase, fy);

  return (
    <main className="mx-auto w-full max-w-[1400px] px-5 py-8">
      <header>
        <p className="ui-eyebrow">Gastos · FY {fyEtiqueta(fy)}</p>
        <h1 className="ui-title">Facturas pre-registradas</h1>
        <p className="ui-lead">
          Registra una factura con el formulario, o varias a la vez desde un Excel. El{" "}
          <strong>número de orden</strong> es el que figura en la factura; la{" "}
          <strong>Orden Interna</strong> es la de SAP, que define la Hunting Zone.
        </p>
      </header>

      <PestanasNav
        etiqueta="Facturas"
        className="mt-6"
        activa="/facturas/nueva"
        pestanas={[
          { href: "/facturas", etiqueta: "Facturas registradas" },
          { href: "/facturas/nueva", etiqueta: "Registrar facturas" },
        ]}
      />

      {opciones.error && (
        <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          No se pudo cargar toda la información: {opciones.error}
        </p>
      )}

      <section className="mt-6">
        <h2 className="ui-section-title">Una factura</h2>
        <div className="mt-3">
          <FormularioFactura
            ordenesInternas={opciones.ordenesInternas}
            cecos={opciones.cecos}
            encargados={opciones.encargados}
            sugerencias={opciones.sugerencias}
            trimestreActual={etiquetaTrimestre(trimestreActual())}
            volverA="/facturas"
            fechaDatosSap={opciones.fechaDatosSap}
          />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="ui-section-title">Varias facturas</h2>
        <div className="mt-3">
          <CargaMasivaFacturas />
        </div>
      </section>
    </main>
  );
}
