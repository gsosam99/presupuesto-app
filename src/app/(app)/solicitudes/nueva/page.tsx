import Link from "next/link";

import {
  FormularioSolicitud,
  type OpcionOi,
} from "@/components/solicitudes/FormularioSolicitud";
import { fyEtiqueta } from "@/lib/fiscal";
import {
  etiquetaVigencia,
  vigenteEnFy,
  type ConVigencia,
} from "@/lib/presupuesto/vigencia";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TipoSolicitud } from "@/types";

export const metadata = { title: "Nueva solicitud — IENN Gastos App" };
export const dynamic = "force-dynamic";

function fyActual(hoy = new Date()): number {
  return hoy.getFullYear() - (hoy.getMonth() + 1 >= 10 ? 0 : 1);
}

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
  const { data } = await supabase
    .from("ordenes_internas")
    .select("id, codigo_oi, nombre, vigencia_desde, vigencia_hasta")
    .eq("activo", true)
    .order("codigo_oi");

  // Solo órdenes vigentes en el año fiscal de la solicitud.
  const ordenesInternas: OpcionOi[] = (data ?? [])
    .filter((o) => vigenteEnFy(o as unknown as ConVigencia, fy))
    .map((o) => ({
      id: o.id as string,
      codigo: o.codigo_oi as string,
      nombre: (o.nombre as string | null) ?? null,
      vigencia: etiquetaVigencia(o as unknown as ConVigencia),
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
