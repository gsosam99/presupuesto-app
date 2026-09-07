"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { CampoSugerido } from "@/components/ui/CampoSugerido";
import { AYUDA, CONTROL, ETIQUETA } from "@/components/ui/estilos";
import { moneda as formatoMoneda } from "@/lib/format";

export interface OpcionOi {
  id: string;
  codigo: string;
  nombre: string | null;
  /** 'real' cuelga de un CeCo y vence; 'tag' (#CAM) es transversal. */
  tipo: "real" | "tag";
  /** CeCo padre. Solo lo tienen las órdenes reales. */
  idCeco: string | null;
  /** Hunting Zone que la maestra ya tiene asociada a esta OI. */
  huntingZone: string | null;
  idHuntingZone: string | null;
  /** Fondos del trimestre en curso: lo que realmente queda para gastar hoy. */
  saldoTrimestre: number | null;
  disponibleTrimestre: number | null;
  consumidoTrimestre: number | null;
  /** Rango de vigencia legible, o null si la orden está abierta. */
  vigencia: string | null;
}

export interface OpcionSelect {
  id: string;
  etiqueta: string;
}

export interface Sugerencias {
  fase: string[];
  motivo: string[];
  detalle: string[];
}

export interface OpcionCeco {
  id: string;
  codigo: string;
  nombre: string;
}

interface Props {
  ordenesInternas: OpcionOi[];
  cecos: OpcionCeco[];
  sugerencias: Sugerencias;
  /** Etiqueta del trimestre en curso, p. ej. "T4 · Jul–Sep". */
  trimestreActual: string;
}

export function FormularioFactura({
  ordenesInternas,
  cecos,
  sugerencias,
  trimestreActual,
}: Props) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [idOi, setIdOi] = useState("");
  const [idCecoManual, setIdCecoManual] = useState("");

  const oiElegida = useMemo(
    () => ordenesInternas.find((o) => o.id === idOi) ?? null,
    [idOi, ordenesInternas],
  );

  // Si la orden es real, el CeCo sale del padre y el campo queda bloqueado.
  // Si es un tag (o no hay orden), el CeCo se elige a mano.
  const cecoHeredado = oiElegida?.tipo === "real" ? oiElegida.idCeco : null;
  const idCecoEfectivo = cecoHeredado ?? idCecoManual;
  const cecoBloqueado = cecoHeredado !== null;

  // Un gasto imputado al CeCo necesita una OI (real o tag) para saber su HZ.
  const faltaOrden = idCecoEfectivo !== "" && !idOi;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const datos = new FormData(form);

    setEnviando(true);
    setError(null);
    setOk(null);

    const montoCrudo = String(datos.get("monto_estimado") ?? "").trim();

    const res = await fetch("/api/facturas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        numero_factura: datos.get("numero_factura"),
        proveedor_codigo: datos.get("proveedor_codigo"),
        texto_referencia: datos.get("texto_referencia"),
        fecha_factura: datos.get("fecha_factura") || null,
        id_oi: idOi || null,
        id_ceco: idCecoEfectivo || null,
        // La Hunting Zone la deduce el servidor desde la OI: nunca se envía.
        id_hunting_zone: null,
        fase: datos.get("fase"),
        motivo: datos.get("motivo"),
        detalle: datos.get("detalle"),
        monto_estimado: montoCrudo === "" ? null : Number(montoCrudo),
        moneda: datos.get("moneda") || "USD",
        nota: datos.get("nota"),
      }),
    });

    const json = (await res.json()) as {
      error?: string;
      factura?: { numero_factura: string };
    };
    setEnviando(false);

    if (!res.ok) {
      setError(json.error ?? "No se pudo guardar la factura.");
      return;
    }

    setOk(`Factura ${json.factura?.numero_factura} registrada.`);
    form.reset();
    setIdOi("");
    setIdCecoManual("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-4">
      {/* Identificación */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor="numero_factura" className={ETIQUETA}>
            Número de factura *
          </label>
          <input id="numero_factura" name="numero_factura" required className={`mt-1 ${CONTROL}`} />
        </div>

        <div>
          <label htmlFor="proveedor_codigo" className={ETIQUETA}>
            N.º de cuenta proveedor o acreedor
          </label>
          <input id="proveedor_codigo" name="proveedor_codigo" className={`mt-1 ${CONTROL}`} />
        </div>

        <div>
          <label htmlFor="fecha_factura" className={ETIQUETA}>
            Fecha de la factura
          </label>
          <input
            id="fecha_factura"
            name="fecha_factura"
            type="date"
            className={`mt-1 ${CONTROL}`}
          />
        </div>

        <div className="sm:col-span-2 lg:col-span-3">
          <label htmlFor="texto_referencia" className={ETIQUETA}>
            Texto de referencia
          </label>
          <input id="texto_referencia" name="texto_referencia" className={`mt-1 ${CONTROL}`} />
        </div>
      </div>

      {/* Destino: el CeCo sale de la OI real; la HZ, siempre de la OI */}
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="id_ceco" className={ETIQUETA}>
            Centro de Costo
          </label>
          <select
            id="id_ceco"
            value={idCecoEfectivo}
            disabled={cecoBloqueado}
            onChange={(e) => setIdCecoManual(e.target.value)}
            className={`mt-1 ${CONTROL} disabled:bg-slate-100 disabled:text-[var(--ink-soft)]`}
          >
            <option value="">— sin definir —</option>
            {cecos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} — {c.nombre}
              </option>
            ))}
          </select>
          <p className={AYUDA}>
            {cecoBloqueado
              ? "Heredado de la Orden Interna."
              : "Si imputas al CeCo, elige además una orden o etiqueta."}
          </p>
        </div>

        <div>
          <label htmlFor="id_oi" className={ETIQUETA}>
            Orden Interna o etiqueta
          </label>
          <select
            id="id_oi"
            name="id_oi"
            value={idOi}
            onChange={(e) => setIdOi(e.target.value)}
            className={`mt-1 ${CONTROL}`}
          >
            <option value="">— sin definir —</option>
            {ordenesInternas.map((o) => (
              <option key={o.id} value={o.id}>
                {o.tipo === "tag" ? "🏷 " : ""}
                {o.codigo}
                {o.nombre ? ` — ${o.nombre}` : ""}
                {o.vigencia ? ` (${o.vigencia})` : ""}
              </option>
            ))}
          </select>
          <p className={AYUDA}>
            La orden define la Hunting Zone. Las etiquetas sirven para los gastos
            imputados directo al CeCo.
          </p>
        </div>

        <div>
          <label htmlFor="id_hunting_zone" className={ETIQUETA}>
            Hunting Zone
          </label>

          <input
            id="id_hunting_zone"
            disabled
            value={
              oiElegida
                ? (oiElegida.huntingZone ?? "La OI no tiene proyecto asociado")
                : ""
            }
            className={`mt-1 ${CONTROL} disabled:bg-slate-100 disabled:text-slate-600`}
          />
          <p className={AYUDA}>Se completa sola con la Orden Interna.</p>
        </div>
      </div>

      {faltaOrden && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Elegiste un Centro de Costo pero no una Orden Interna. Agrega la orden real
          vigente o una etiqueta (#CAM) para que el gasto sepa a qué Hunting Zone
          pertenece.
        </p>
      )}

      {/* Fondos de la OI elegida: es el dato que hace falta antes de emitir la
          factura, para no comprometer plata que el trimestre ya no tiene. */}
      {oiElegida && oiElegida.saldoTrimestre !== null && (
        <div
          className={
            "mt-4 rounded-md border px-4 py-3 " +
            (oiElegida.saldoTrimestre > 0
              ? "border-[rgba(30,138,138,0.35)] bg-[rgba(30,138,138,0.08)]"
              : "border-[rgba(158,43,51,0.35)] bg-[rgba(158,43,51,0.07)]")
          }
        >
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">
            Fondos de {oiElegida.codigo} · {trimestreActual}
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <p
              className="text-2xl font-extrabold tabular-nums"
              style={{
                color:
                  oiElegida.saldoTrimestre > 0 ? "var(--ok)" : "var(--bad)",
              }}
            >
              {formatoMoneda.format(oiElegida.saldoTrimestre)}
            </p>
            <p className="text-xs text-[var(--muted)]">
              disponible {formatoMoneda.format(oiElegida.disponibleTrimestre ?? 0)} ·
              consumido {formatoMoneda.format(oiElegida.consumidoTrimestre ?? 0)}
            </p>
          </div>
          {oiElegida.saldoTrimestre <= 0 && (
            <p className="mt-1 text-xs font-semibold text-[var(--bad)]">
              Este trimestre ya no tiene fondos: hace falta un extra plan antes de
              comprometer el gasto.
            </p>
          )}
        </div>
      )}

      {/* Taxonomía: los tres campos en una misma fila */}
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="fase" className={ETIQUETA}>
            Fase
          </label>
          <CampoSugerido
            id="fase"
            name="fase"
            sugerencias={sugerencias.fase}
            className={`mt-1 ${CONTROL}`}
          />
        </div>
        <div>
          <label htmlFor="motivo" className={ETIQUETA}>
            Motivo
          </label>
          <CampoSugerido
            id="motivo"
            name="motivo"
            sugerencias={sugerencias.motivo}
            className={`mt-1 ${CONTROL}`}
          />
        </div>
        <div>
          <label htmlFor="detalle" className={ETIQUETA}>
            Detalle
          </label>
          <CampoSugerido
            id="detalle"
            name="detalle"
            sugerencias={sugerencias.detalle}
            className={`mt-1 ${CONTROL}`}
          />
        </div>
      </div>

      {/* Monto y nota */}
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="monto_estimado" className={ETIQUETA}>
            Monto de la factura
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="monto_estimado"
              name="monto_estimado"
              type="number"
              step="0.01"
              className={CONTROL}
            />
            <select
              name="moneda"
              defaultValue="USD"
              aria-label="Moneda"
              className={`${CONTROL} w-24`}
            >
              <option value="USD">USD</option>
              <option value="VES">Bs</option>
            </select>
          </div>
          <p className={AYUDA}>Solo informativo: no se usa para cruzar, únicamente para el desvío.</p>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="nota" className={ETIQUETA}>
            Nota
          </label>
          <input id="nota" name="nota" className={`mt-1 ${CONTROL}`} />
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      {ok && (
        <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{ok}</p>
      )}

      <div className="mt-4">
        <Button type="submit" disabled={enviando || faltaOrden}>
          {enviando ? "Guardando…" : "Registrar factura"}
        </Button>
      </div>
    </form>
  );
}
