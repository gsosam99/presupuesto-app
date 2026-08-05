"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { CampoSugerido } from "@/components/ui/CampoSugerido";

export interface OpcionSelect {
  id: string;
  etiqueta: string;
}

export interface Sugerencias {
  fase: string[];
  motivo: string[];
  detalle: string[];
}

interface Props {
  ordenesInternas: OpcionSelect[];
  huntingZones: OpcionSelect[];
  sugerencias: Sugerencias;
}

const CLASE_CAMPO =
  "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200";

export function FormularioFactura({ ordenesInternas, huntingZones, sugerencias }: Props) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

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
        id_oi: datos.get("id_oi") || null,
        id_hunting_zone: datos.get("id_hunting_zone") || null,
        fase: datos.get("fase"),
        motivo: datos.get("motivo"),
        detalle: datos.get("detalle"),
        monto_estimado: montoCrudo === "" ? null : Number(montoCrudo),
        moneda: datos.get("moneda") || "USD",
        nota: datos.get("nota"),
      }),
    });

    const json = (await res.json()) as { error?: string; factura?: { numero_factura: string } };
    setEnviando(false);

    if (!res.ok) {
      setError(json.error ?? "No se pudo guardar la factura.");
      return;
    }

    setOk(`Factura ${json.factura?.numero_factura} registrada.`);
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor="numero_factura" className="block text-sm font-medium text-slate-700">
            Número de factura *
          </label>
          <input id="numero_factura" name="numero_factura" required className={CLASE_CAMPO} />
          <p className="mt-1 text-xs text-slate-500">
            Los ceros a la izquierda no importan: el cruce los ignora.
          </p>
        </div>

        <div>
          <label
            htmlFor="proveedor_codigo"
            className="block text-sm font-medium text-slate-700"
          >
            N.º de cuenta proveedor o acreedor
          </label>
          <input id="proveedor_codigo" name="proveedor_codigo" className={CLASE_CAMPO} />
          <p className="mt-1 text-xs text-slate-500">
            Código SAP del acreedor. Desempata si dos facturas comparten número.
          </p>
        </div>

        <div>
          <label htmlFor="fecha_factura" className="block text-sm font-medium text-slate-700">
            Fecha de la factura
          </label>
          <input id="fecha_factura" name="fecha_factura" type="date" className={CLASE_CAMPO} />
        </div>

        <div className="sm:col-span-2 lg:col-span-3">
          <label htmlFor="texto_referencia" className="block text-sm font-medium text-slate-700">
            Texto de referencia
          </label>
          <input id="texto_referencia" name="texto_referencia" className={CLASE_CAMPO} />
        </div>

        <div>
          <label htmlFor="id_oi" className="block text-sm font-medium text-slate-700">
            Orden Interna
          </label>
          <select id="id_oi" name="id_oi" defaultValue="" className={CLASE_CAMPO}>
            <option value="">— sin definir —</option>
            {ordenesInternas.map((o) => (
              <option key={o.id} value={o.id}>
                {o.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="id_hunting_zone" className="block text-sm font-medium text-slate-700">
            Hunting Zone
          </label>
          <select id="id_hunting_zone" name="id_hunting_zone" defaultValue="" className={CLASE_CAMPO}>
            <option value="">— sin definir —</option>
            {huntingZones.map((h) => (
              <option key={h.id} value={h.id}>
                {h.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="fase" className="block text-sm font-medium text-slate-700">
            Fase
          </label>
          <CampoSugerido
            id="fase"
            name="fase"
            sugerencias={sugerencias.fase}
            className={CLASE_CAMPO}
          />
        </div>

        <div>
          <label htmlFor="motivo" className="block text-sm font-medium text-slate-700">
            Motivo
          </label>
          <CampoSugerido
            id="motivo"
            name="motivo"
            sugerencias={sugerencias.motivo}
            className={CLASE_CAMPO}
          />
        </div>

        <div>
          <label htmlFor="detalle" className="block text-sm font-medium text-slate-700">
            Detalle
          </label>
          <CampoSugerido
            id="detalle"
            name="detalle"
            sugerencias={sugerencias.detalle}
            className={CLASE_CAMPO}
          />
        </div>

        <div>
          <label htmlFor="monto_estimado" className="block text-sm font-medium text-slate-700">
            Monto de la factura
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="monto_estimado"
              name="monto_estimado"
              type="number"
              step="0.01"
              className={CLASE_CAMPO.replace("mt-1 ", "")}
            />
            <select
              name="moneda"
              defaultValue="USD"
              aria-label="Moneda"
              className={CLASE_CAMPO.replace("mt-1 block w-full", "w-24")}
            >
              <option value="USD">USD</option>
              <option value="VES">Bs</option>
            </select>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Solo informativo: no se usa para cruzar, únicamente para medir desvío.
          </p>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="nota" className="block text-sm font-medium text-slate-700">
            Nota
          </label>
          <input id="nota" name="nota" className={CLASE_CAMPO} />
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
        <Button type="submit" disabled={enviando}>
          {enviando ? "Guardando…" : "Registrar factura"}
        </Button>
      </div>
    </form>
  );
}
