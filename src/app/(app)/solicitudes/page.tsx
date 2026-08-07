import Link from "next/link";

import { etiquetaTrimestre, fyEtiqueta } from "@/lib/fiscal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EstadoSolicitud, TipoSolicitud } from "@/types";

export const metadata = { title: "Solicitudes — IENN Gastos App" };
export const dynamic = "force-dynamic";

interface Fila {
  id: string;
  tipo: TipoSolicitud;
  estado: EstadoSolicitud;
  fy: number;
  trimestre: number | null;
  titulo: string;
  monto_solicitado: number | null;
  created_at: string;
  id_oi: string | null;
}

const moneda = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const ESTILO_ESTADO: Record<EstadoSolicitud, string> = {
  borrador: "bg-[var(--line-soft)] text-[var(--ink-soft)]",
  enviada: "bg-[rgba(224,169,62,0.16)] text-[#9a7420]",
  aprobada: "bg-[rgba(30,138,138,0.13)] text-[var(--ok)]",
  rechazada: "bg-[rgba(158,43,51,0.12)] text-[var(--bad)]",
};

export default async function SolicitudesPage() {
  const supabase = await createSupabaseServerClient();

  const [solicitudes, ois] = await Promise.all([
    supabase
      .from("solicitudes")
      .select("id, tipo, estado, fy, trimestre, titulo, monto_solicitado, created_at, id_oi")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("ordenes_internas").select("id, codigo_oi"),
  ]);

  const filas = (solicitudes.data ?? []) as unknown as Fila[];
  const codigoPorOi = new Map(
    ((ois.data ?? []) as Array<{ id: string; codigo_oi: string }>).map((o) => [
      o.id,
      o.codigo_oi,
    ]),
  );

  const pendientes = filas.filter((f) => f.estado === "enviada");

  return (
    <main className="mx-auto w-full max-w-[1240px] px-5 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="ui-eyebrow">Gestión de presupuesto</p>
          <h1 className="ui-title">Solicitudes</h1>
          <p className="ui-lead">
            Extra plan y prórrogas de sobrante. La app arma el archivo para finanzas y
            deja el pedido pendiente; cuando Charles y finanzas aprueban por fuera, lo
            marcas como aprobado y los fondos entran al presupuesto.
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/solicitudes/nueva?tipo=extra_plan"
            className="rounded-md bg-[var(--navy)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Nuevo extra plan
          </Link>
          <Link
            href="/solicitudes/nueva?tipo=prorroga"
            className="rounded-md border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--line-soft)]"
          >
            Nueva prórroga
          </Link>
        </div>
      </header>

      {pendientes.length > 0 && (
        <p className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Tienes <strong>{pendientes.length}</strong>{" "}
          {pendientes.length === 1 ? "solicitud enviada" : "solicitudes enviadas"} esperando
          respuesta. Cuando finanzas apruebe, entra y márcala para que los fondos se
          carguen.
        </p>
      )}

      <section className="mt-8">
        {filas.length === 0 ? (
          <p className="ui-card px-4 py-10 text-center text-sm text-[var(--muted)]">
            Todavía no hay solicitudes. Empieza por una de extra plan o una prórroga.
          </p>
        ) : (
          <div className="ui-card overflow-x-auto">
            <table className="ui-table min-w-[56rem] text-sm">
              <thead>
                <tr>
                  <th>Solicitud</th>
                  <th>Tipo</th>
                  <th>Orden Interna</th>
                  <th>Período</th>
                  <th className="r">Monto</th>
                  <th>Estado</th>
                  <th>Creada</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <Link
                        href={`/solicitudes/${f.id}`}
                        className="font-semibold text-[var(--ink)] hover:underline"
                      >
                        {f.titulo}
                      </Link>
                    </td>
                    <td>{f.tipo === "extra_plan" ? "Extra plan" : "Prórroga"}</td>
                    <td className="font-mono text-xs">
                      {f.id_oi ? (codigoPorOi.get(f.id_oi) ?? "—") : "—"}
                    </td>
                    <td className="whitespace-nowrap">
                      {fyEtiqueta(f.fy)}
                      {f.trimestre ? ` · ${etiquetaTrimestre(f.trimestre)}` : ""}
                    </td>
                    <td className="r">
                      {f.monto_solicitado === null
                        ? "—"
                        : moneda.format(Number(f.monto_solicitado))}
                    </td>
                    <td>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ESTILO_ESTADO[f.estado]}`}
                      >
                        {f.estado}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-xs">
                      {new Date(f.created_at).toLocaleDateString("es-VE")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
