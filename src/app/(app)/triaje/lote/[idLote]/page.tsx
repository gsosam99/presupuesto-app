import Link from "next/link";
import { notFound } from "next/navigation";

import {
  PasoCruceAutomatico,
  type GrupoCruce,
} from "@/components/triaje/asistente/PasoCruceAutomatico";
import { PasoMatchManual } from "@/components/triaje/asistente/PasoMatchManual";
import { PasoResumen } from "@/components/triaje/asistente/PasoResumen";
import {
  PASOS,
  PasosAsistente,
  type NumeroPaso,
} from "@/components/triaje/asistente/PasosAsistente";
import { TablaTriaje, type GastoPendiente } from "@/components/triaje/TablaTriaje";
import { requireRol } from "@/lib/auth";
import { sugerirFacturas, type Sugerencia } from "@/lib/ingesta/sugerenciasCruce";
import { tienePermiso } from "@/lib/permisos";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerCatalogosTriaje } from "@/lib/triaje/catalogos";
import { obtenerFacturasSinCruzar, obtenerLote, type GastoLote } from "@/lib/triaje/lote";

export const metadata = { title: "Cruce de carga SAP — IENN Gastos App" };
export const dynamic = "force-dynamic";

/** Título de un paso por su número (1..6). */
function tituloPaso(n: number): string {
  return (PASOS as readonly string[])[n - 1] ?? "";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Agrupa por factura los gastos que cruzaron solos (paso 3). */
function agruparCruces(gastos: GastoLote[]): GrupoCruce[] {
  const grupos = new Map<string, GrupoCruce>();
  for (const g of gastos) {
    if (g.metodo_cruce !== "automatico" || !g.id_factura_preregistrada) continue;
    const previo = grupos.get(g.id_factura_preregistrada) ?? {
      idFactura: g.id_factura_preregistrada,
      numero: g.factura_preregistrada ?? g.factura ?? "—",
      numeroOrden: g.numero_orden,
      encargado: g.encargado,
      codigoOi: g.codigo_oi,
      huntingZone: g.hunting_zone,
      montoEstimado: g.monto_estimado,
      moneda: g.moneda,
      idsGasto: [],
      real: 0,
    };
    previo.idsGasto.push(g.id);
    previo.real += g.monto_real;
    grupos.set(g.id_factura_preregistrada, previo);
  }
  return [...grupos.values()].sort((a, b) => a.numero.localeCompare(b.numero, "es"));
}

export default async function LotePage({
  params,
  searchParams,
}: {
  params: Promise<{ idLote: string }>;
  searchParams: Promise<{ paso?: string }>;
}) {
  const { rol } = await requireRol();
  const puedeEditar = tienePermiso(rol, "triaje:editar");

  const { idLote } = await params;
  if (!UUID.test(idLote)) notFound();

  const numero = Number((await searchParams).paso);
  const paso: NumeroPaso = numero >= 3 && numero <= 6 ? (numero as NumeroPaso) : 3;

  const supabase = await createSupabaseServerClient();
  const lote = await obtenerLote(supabase, idLote);
  if (!lote.error && lote.cargas.length === 0) notFound();

  const pendientes = lote.gastos.filter((g) => g.estado_revision === "pendiente");
  const sinFactura = pendientes.filter((g) => g.id_factura_preregistrada === null);

  // Solo se consulta lo que el paso visible necesita.
  const [facturas, catalogos] = await Promise.all([
    paso === 4 ? obtenerFacturasSinCruzar(supabase) : Promise.resolve(null),
    paso === 5 ? obtenerCatalogosTriaje(supabase) : Promise.resolve(null),
  ]);

  const sugerencias: Record<string, Sugerencia[]> = {};
  if (facturas) {
    for (const g of sinFactura) {
      sugerencias[g.id] = sugerirFacturas(g, facturas.data);
    }
  }

  const errorCarga = lote.error ?? facturas?.error ?? catalogos?.error ?? null;
  const fecha = lote.cargas[0]
    ? new Date(lote.cargas[0].created_at).toLocaleString("es-VE", {
        dateStyle: "long",
        timeStyle: "short",
      })
    : "";

  return (
    <main className="mx-auto w-full max-w-[110rem] px-6 py-10">
      <header>
        <p className="ui-eyebrow">
          <Link href="/cargas" className="hover:underline">
            Historial de cargas
          </Link>{" "}
          · {fecha}
        </p>
        <h1 className="ui-title">Cruce de la carga SAP</h1>
        <p className="ui-lead">{lote.cargas.map((c) => c.nombre_archivo).join(" · ")}</p>
      </header>

      <div className="mt-6">
        <PasosAsistente
          actual={paso}
          idLote={idLote}
          contadores={{ 4: sinFactura.length, 5: pendientes.length }}
        />
      </div>

      {errorCarga && (
        <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          No se pudo cargar toda la información: {errorCarga}
        </p>
      )}

      <section className="mt-6">
        <h2 className="ui-section-title">
          Paso {paso} · {tituloPaso(paso)}
        </h2>
        <div className="mt-4">
          {paso === 3 && (
            <PasoCruceAutomatico grupos={agruparCruces(lote.gastos)} puedeEditar={puedeEditar} />
          )}
          {paso === 4 && facturas && (
            <PasoMatchManual
              gastos={sinFactura}
              sugerencias={sugerencias}
              facturas={facturas.data}
              puedeEditar={puedeEditar}
            />
          )}
          {paso === 5 && catalogos && (
            <>
              <p className="mb-4 max-w-3xl text-sm text-[var(--ink-soft)]">
                Gastos de esta carga que siguen pendientes. Asigna la Orden Interna o una etiqueta,
                la taxonomía y el encargado; <kbd>Enter</kbd> aprueba.
              </p>
              <TablaTriaje
                gastos={pendientes as unknown as GastoPendiente[]}
                asignaciones={catalogos.asignaciones}
                sugerencias={catalogos.sugerencias}
                encargados={catalogos.encargados}
                totalPendientes={pendientes.length}
                soloLectura={!puedeEditar}
              />
            </>
          )}
          {paso === 6 && <PasoResumen cargas={lote.cargas} gastos={lote.gastos} />}
        </div>
      </section>

      <nav
        aria-label="Navegación del asistente"
        className="mt-8 flex justify-between gap-3 border-t border-[var(--line)] pt-4"
      >
        {paso > 3 ? (
          <Link
            href={`/triaje/lote/${idLote}?paso=${paso - 1}`}
            className="rounded-md border border-[var(--line)] bg-white px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--line-soft)]"
          >
            ← {tituloPaso(paso - 1)}
          </Link>
        ) : (
          <span />
        )}
        {paso < 6 ? (
          <Link
            href={`/triaje/lote/${idLote}?paso=${paso + 1}`}
            className="rounded-md bg-[var(--navy)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            {tituloPaso(paso + 1)} →
          </Link>
        ) : (
          <Link
            href="/triaje"
            className="rounded-md bg-[var(--navy)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Ir a la Sala de Triaje
          </Link>
        )}
      </nav>
    </main>
  );
}
