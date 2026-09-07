import Link from "next/link";

import {
  FormularioSolicitud,
  type OpcionOi,
} from "@/components/solicitudes/FormularioSolicitud";
import { fyActual, fyEtiqueta } from "@/lib/fiscal";
import { obtenerOrdenesInternasActivas } from "@/lib/presupuesto/ordenesInternas";
import { etiquetaVigencia, vigenteEnFy } from "@/lib/presupuesto/vigencia";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TipoSolicitud } from "@/types";

export const metadata = { title: "Nueva solicitud — IENN Gastos App" };
export const dynamic = "force-dynamic";

export default async function NuevaSolicitudPage({
  searchParams,
}: {
  searchParams: Promise<{
    tipo?: string;
    oi?: string;
    fy?: string;
    trimestre?: string;
    monto?: string;
  }>;
}) {
  const params = await searchParams;
  const tipo: TipoSolicitud = params.tipo === "prorroga" ? "prorroga" : "extra_plan";
  const fy = Number(params.fy) || fyActual();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await obtenerOrdenesInternasActivas(supabase);

  // Solo órdenes vigentes en el año fiscal de la solicitud.
  const ordenesInternas: OpcionOi[] = data
    .filter((o) => vigenteEnFy(o, fy))
    .map((o) => ({
      id: o.id,
      codigo: o.codigo_oi,
      nombre: o.nombre,
      vigencia: etiquetaVigencia(o),
    }));

  return (
    <main className="mx-auto w-full max-w-[1100px] px-5 py-8">
      <header>
        <p className="ui-eyebrow">
          <Link href="/solicitudes" className="hover:underline">
            Solicitudes
          </Link>{" "}
          · Nueva
        </p>
        <h1 className="ui-title">Nueva solicitud · {fyEtiqueta(fy)}</h1>
        <p className="ui-lead">
          Arma acá el pedido y descarga el archivo para finanzas. Queda como solicitud
          pendiente: recién cuando Charles y finanzas aprueben, la marcas como aprobada y{" "}
          <strong>ahí se carga al presupuesto</strong>.
        </p>
      </header>

      {error && (
        <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          No se pudieron cargar las órdenes internas: {error.message}
        </p>
      )}

      <section className="mt-6">
        <FormularioSolicitud
          ordenesInternas={ordenesInternas}
          fy={fy}
          tipoInicial={tipo}
          oiInicial={params.oi}
          trimestreInicial={params.trimestre ? Number(params.trimestre) : undefined}
          montoInicial={params.monto ? Number(params.monto) : undefined}
        />
      </section>
    </main>
  );
}
