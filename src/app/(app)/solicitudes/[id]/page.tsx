import Link from "next/link";
import { notFound } from "next/navigation";

import { AccionesSolicitud } from "@/components/solicitudes/AccionesSolicitud";
import { etiquetaTrimestre, fyEtiqueta, nombreMes, trimestreDeMes } from "@/lib/fiscal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EstadoSolicitud, TipoSolicitud } from "@/types";

export const metadata = { title: "Solicitud — IENN Gastos App" };
export const dynamic = "force-dynamic";

interface Linea {
  id: string;
  mes: number;
  monto: number;
  cuenta_contable: string | null;
  descripcion_cuenta: string | null;
  tipo_gasto: string | null;
  detalle_gasto: string | null;
  responsable: string | null;
}

const moneda = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default async function SolicitudPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: solicitud } = await supabase
    .from("solicitudes")
    .select(
      "id, tipo, estado, fy, trimestre, titulo, justificacion, monto_solicitado, referencia_aprobacion, nota_resolucion, created_at, enviada_at, resuelta_at, id_oi",
    )
    .eq("id", id)
    .maybeSingle();

  if (!solicitud) notFound();

  const tipo = solicitud.tipo as TipoSolicitud;
  const estado = solicitud.estado as EstadoSolicitud;

  const [lineasRes, oiRes] = await Promise.all([
    supabase
      .from("solicitud_lineas")
      .select(
        "id, mes, monto, cuenta_contable, descripcion_cuenta, tipo_gasto, detalle_gasto, responsable",
      )
      .eq("id_solicitud", id)
      .order("mes"),
    solicitud.id_oi
      ? supabase
          .from("ordenes_internas")
          .select("codigo_oi, nombre")
          .eq("id", solicitud.id_oi as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const lineas = (lineasRes.data ?? []) as unknown as Linea[];
  const total = lineas.reduce((s, l) => s + Number(l.monto), 0);

  return (
    <main className="mx-auto w-full max-w-[1100px] px-5 py-8">
      <header>
        <p className="ui-eyebrow">
          <Link href="/solicitudes" className="hover:underline">
            Solicitudes
          </Link>{" "}
          · {tipo === "extra_plan" ? "Extra plan" : "Prórroga"}
        </p>
        <h1 className="ui-title">{solicitud.titulo as string}</h1>
        <p className="ui-lead">
          {fyEtiqueta(Number(solicitud.fy))}
          {solicitud.trimestre
            ? ` · ${etiquetaTrimestre(Number(solicitud.trimestre))}`
            : ""}
          {oiRes.data?.codigo_oi ? ` · OI ${oiRes.data.codigo_oi as string}` : ""}
          {" · estado "}
          <strong>{estado}</strong>
        </p>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {tipo === "extra_plan" ? (
            <section className="ui-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
                <h2 className="ui-section-title">Líneas solicitadas</h2>
                <p className="text-sm font-bold tabular-nums text-[var(--ink)]">
                  {moneda.format(total)}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="ui-table min-w-[46rem] text-xs">
                  <thead>
                    <tr>
                      <th>Mes</th>
                      <th>Trimestre</th>
                      <th>Tipo de gasto</th>
                      <th>Detalle</th>
                      <th>Cuenta</th>
                      <th>Responsable</th>
                      <th className="r">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineas.map((l) => (
                      <tr key={l.id}>
                        <td>{nombreMes(l.mes)}</td>
                        <td>T{trimestreDeMes(l.mes)}</td>
                        <td>{l.tipo_gasto ?? "—"}</td>
                        <td>{l.detalle_gasto ?? "—"}</td>
                        <td className="font-mono text-[11px]">
                          {l.cuenta_contable ?? "—"}
                        </td>
                        <td>{l.responsable ?? "—"}</td>
                        <td className="r font-semibold">{moneda.format(Number(l.monto))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <section className="ui-card p-4">
              <h2 className="ui-section-title">Monto a conservar</h2>
              <p className="mt-2 text-3xl font-extrabold tabular-nums text-[var(--ink)]">
                {moneda.format(Number(solicitud.monto_solicitado ?? 0))}
              </p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Sobrante de {etiquetaTrimestre(Number(solicitud.trimestre))} que, aprobado,
                queda disponible en el trimestre siguiente en vez de perderse.
              </p>
            </section>
          )}

          {(solicitud.justificacion as string | null) && (
            <section className="ui-card p-4">
              <h2 className="ui-section-title">Justificación</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--ink-soft)]">
                {solicitud.justificacion as string}
              </p>
            </section>
          )}

          <section className="ui-card p-4">
            <h2 className="ui-section-title">Trazabilidad</h2>
            <dl className="mt-3 space-y-1.5 text-sm text-[var(--ink-soft)]">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted)]">Creada</dt>
                <dd>{new Date(solicitud.created_at as string).toLocaleString("es-VE")}</dd>
              </div>
              {(solicitud.enviada_at as string | null) && (
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--muted)]">Enviada</dt>
                  <dd>
                    {new Date(solicitud.enviada_at as string).toLocaleString("es-VE")}
                  </dd>
                </div>
              )}
              {(solicitud.resuelta_at as string | null) && (
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--muted)]">Resuelta</dt>
                  <dd>
                    {new Date(solicitud.resuelta_at as string).toLocaleString("es-VE")}
                  </dd>
                </div>
              )}
              {(solicitud.referencia_aprobacion as string | null) && (
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--muted)]">Referencia</dt>
                  <dd>{solicitud.referencia_aprobacion as string}</dd>
                </div>
              )}
              {(solicitud.nota_resolucion as string | null) && (
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--muted)]">Nota</dt>
                  <dd>{solicitud.nota_resolucion as string}</dd>
                </div>
              )}
            </dl>
          </section>
        </div>

        <aside>
          <AccionesSolicitud
            id={id}
            tipo={tipo}
            estado={estado}
            referenciaActual={(solicitud.referencia_aprobacion as string | null) ?? null}
          />
        </aside>
      </div>
    </main>
  );
}
