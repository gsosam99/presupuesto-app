"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { CampoSugerido } from "@/components/ui/CampoSugerido";
import { AYUDA, CONTROL, ETIQUETA } from "@/components/ui/estilos";
import { fyEtiqueta, MESES_FY, nombreMes } from "@/lib/fiscal";

export interface OpcionHz {
  id: string;
  nombre: string;
}

export interface SugerenciasIngreso {
  concepto: string[];
  fase: string[];
  motivo: string[];
  detalle: string[];
}

interface Props {
  /** Viene del selector global de la barra lateral; acá no se edita. */
  fy: number;
  huntingZones: OpcionHz[];
  sugerencias: SugerenciasIngreso;
  /** Mes preseleccionado: el mes calendario en curso si cae dentro del FY. */
  mesInicial: number;
}

export function FormularioIngreso({ fy, huntingZones, sugerencias, mesInicial }: Props) {
  const router = useRouter();

  const [mes, setMes] = useState(mesInicial);
  const [idHz, setIdHz] = useState("");
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

    try {
      const res = await fetch("/api/ingresos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fy,
          mes,
          id_hunting_zone: idHz,
          monto: Number(datos.get("monto")),
          concepto: String(datos.get("concepto") ?? ""),
          fase: String(datos.get("fase") ?? ""),
          motivo: String(datos.get("motivo") ?? ""),
          detalle: String(datos.get("detalle") ?? ""),
          nota: String(datos.get("nota") ?? ""),
        }),
      });
      const json = (await res.json()) as { id?: string; error?: string };

      if (!res.ok) {
        setError(json.error ?? "No se pudo registrar el ingreso.");
        return;
      }

      // Se queda en la página: los ingresos se cargan de a varios seguidos.
      // El mes y la Hunting Zone NO se resetean a propósito — lo habitual es
      // cargar varias líneas del mismo período y proyecto.
      form.reset();
      setOk("Ingreso registrado.");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="ui-card p-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="fy" className={ETIQUETA}>
            Año fiscal
          </label>
          <input
            id="fy"
            disabled
            value={`FY ${fyEtiqueta(fy)}`}
            className={`mt-1 ${CONTROL} disabled:bg-slate-100 disabled:text-slate-600`}
          />
          <p className={AYUDA}>Se cambia en el selector de la barra lateral.</p>
        </div>

        <div>
          <label htmlFor="mes" className={ETIQUETA}>
            Mes *
          </label>
          <select
            id="mes"
            required
            value={mes}
            onChange={(e) => setMes(Number(e.target.value))}
            className={`mt-1 ${CONTROL}`}
          >
            {MESES_FY.map((m) => (
              <option key={m} value={m}>
                {nombreMes(m)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="id_hunting_zone" className={ETIQUETA}>
            Hunting Zone *
          </label>
          <select
            id="id_hunting_zone"
            required
            value={idHz}
            onChange={(e) => setIdHz(e.target.value)}
            className={`mt-1 ${CONTROL}`}
          >
            <option value="">— elegir —</option>
            {huntingZones.map((h) => (
              <option key={h.id} value={h.id}>
                {h.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label htmlFor="concepto" className={ETIQUETA}>
            Concepto *
          </label>
          <CampoSugerido
            id="concepto"
            name="concepto"
            required
            sugerencias={sugerencias.concepto}
            className={`mt-1 ${CONTROL}`}
          />
          <p className={AYUDA}>Qué se cobró. Es el descriptor principal del ingreso.</p>
        </div>

        <div>
          <label htmlFor="monto" className={ETIQUETA}>
            Monto *
          </label>
          <input
            id="monto"
            name="monto"
            type="number"
            step="0.01"
            required
            className={`mt-1 ${CONTROL}`}
          />
          <p className={AYUDA}>En negativo si es una devolución.</p>
        </div>
      </div>

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

      <div className="mt-4">
        <label htmlFor="nota" className={ETIQUETA}>
          Nota
        </label>
        <input id="nota" name="nota" className={`mt-1 ${CONTROL}`} />
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-[var(--bad)]">
          {error}
        </p>
      )}
      {ok && (
        <p className="mt-4 rounded-md bg-[rgba(30,138,138,0.1)] px-3 py-2 text-sm text-[var(--ok)]">
          {ok}
        </p>
      )}

      <div className="mt-5">
        <Button type="submit" disabled={enviando}>
          {enviando ? "Registrando…" : "Registrar ingreso"}
        </Button>
      </div>
    </form>
  );
}
