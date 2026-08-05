"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { CampoSugerido } from "@/components/ui/CampoSugerido";
import { AYUDA, CONTROL, ETIQUETA } from "@/components/ui/estilos";

export interface OpcionOi {
  id: string;
  codigo: string;
  nombre: string | null;
  /** Hunting Zone que la maestra ya tiene asociada a esta OI. */
  huntingZone: string | null;
  idHuntingZone: string | null;
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

interface Props {
  ordenesInternas: OpcionOi[];
  sugerencias: Sugerencias;
}

export function FormularioFactura({ ordenesInternas, sugerencias }: Props) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [idOi, setIdOi] = useState("");

  const oiElegida = useMemo(
    () => ordenesInternas.find((o) => o.id === idOi) ?? null,
    [idOi, ordenesInternas],
  );

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
        // La Hunting Zone la deduce el servidor desde la maestra: nunca se envía.
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

      {/* Destino: la Hunting Zone se deduce de la OI */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="id_oi" className={ETIQUETA}>
            Orden Interna
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
                {o.codigo}
                {o.nombre ? ` — ${o.nombre}` : ""}
              </option>
            ))}
          </select>
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
        <Button type="submit" disabled={enviando}>
          {enviando ? "Guardando…" : "Registrar factura"}
        </Button>
      </div>
    </form>
  );
}
