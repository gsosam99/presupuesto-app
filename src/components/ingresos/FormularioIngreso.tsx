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

export interface FilaIngreso {
  id: string;
  mes: number;
  id_hunting_zone: string;
  concepto: string;
  fase: string | null;
  motivo: string | null;
  detalle: string | null;
  monto: number;
  nota: string | null;
}

interface Props {
  /** Viene del selector global de la barra lateral; acá no se edita. */
  fy: number;
  huntingZones: OpcionHz[];
  sugerencias: SugerenciasIngreso;
  /** Mes preseleccionado: el mes calendario en curso si cae dentro del FY. */
  mesInicial: number;
  /** Ingreso a corregir. Sin él, el formulario da de alta uno nuevo. */
  inicial?: FilaIngreso;
  /** Tras guardar, con el mensaje para el aviso. */
  onGuardado: (mensaje: string) => void;
  onCancelar: () => void;
}

/**
 * Alta y corrección de un ingreso. Vive dentro de un modal (ver
 * TablaIngresos): la tabla es la vista principal del módulo.
 */
export function FormularioIngreso({
  fy,
  huntingZones,
  sugerencias,
  mesInicial,
  inicial,
  onGuardado,
  onCancelar,
}: Props) {
  const router = useRouter();
  const editando = inicial !== undefined;

  const [mes, setMes] = useState(inicial?.mes ?? mesInicial);
  const [idHz, setIdHz] = useState(inicial?.id_hunting_zone ?? "");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registrados, setRegistrados] = useState(0);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    // Qué botón lo envió: "otro" deja el modal abierto para seguir cargando.
    const seguir = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "otro";
    const datos = new FormData(form);

    setEnviando(true);
    setError(null);

    const cuerpo = {
      mes,
      id_hunting_zone: idHz,
      monto: Number(datos.get("monto")),
      concepto: String(datos.get("concepto") ?? ""),
      fase: String(datos.get("fase") ?? ""),
      motivo: String(datos.get("motivo") ?? ""),
      detalle: String(datos.get("detalle") ?? ""),
      nota: String(datos.get("nota") ?? ""),
    };

    try {
      const res = await fetch("/api/ingresos", {
        method: editando ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editando ? { id: inicial.id, ...cuerpo } : { fy, ...cuerpo }),
      });
      const json = (await res.json()) as { id?: string; error?: string };

      if (!res.ok) {
        setError(json.error ?? "No se pudo guardar el ingreso.");
        return;
      }

      router.refresh();
      if (seguir) {
        // El mes y la Hunting Zone NO se resetean a propósito: lo habitual es
        // cargar varias líneas del mismo período y proyecto.
        form.reset();
        setRegistrados((n) => n + 1);
        form.querySelector<HTMLInputElement>("#concepto")?.focus();
        return;
      }
      onGuardado(
        editando ? `Ingreso "${cuerpo.concepto.trim()}" actualizado.` : "Ingreso registrado.",
      );
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
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
          <p className={AYUDA}>Se cambia en la barra lateral.</p>
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
            defaultValue={inicial?.concepto}
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
            defaultValue={inicial?.monto}
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
            defaultValue={inicial?.fase ?? ""}
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
            defaultValue={inicial?.motivo ?? ""}
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
            defaultValue={inicial?.detalle ?? ""}
            sugerencias={sugerencias.detalle}
            className={`mt-1 ${CONTROL}`}
          />
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="nota" className={ETIQUETA}>
          Nota
        </label>
        <input
          id="nota"
          name="nota"
          defaultValue={inicial?.nota ?? ""}
          className={`mt-1 ${CONTROL}`}
        />
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-[var(--bad)]">
          {error}
        </p>
      )}
      {registrados > 0 && !error && (
        <p className="mt-4 rounded-md bg-[rgba(30,138,138,0.1)] px-3 py-2 text-sm text-[var(--ok)]">
          {registrados === 1 ? "1 ingreso registrado" : `${registrados} ingresos registrados`}.
          Puedes seguir cargando.
        </p>
      )}

      {/* En móvil apilados, con la acción principal arriba; en escritorio, en
          fila a la derecha (mismo orden que ModalConfirmacion). */}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variante="secundario" disabled={enviando} onClick={onCancelar}>
          {registrados > 0 ? "Cerrar" : "Cancelar"}
        </Button>
        {!editando && (
          <Button
            type="submit"
            name="accion"
            value="otro"
            variante="secundario"
            disabled={enviando}
          >
            Guardar y registrar otro
          </Button>
        )}
        <Button cargando={enviando} type="submit" name="accion" value="cerrar" disabled={enviando}>
          {enviando ? "Guardando…" : editando ? "Guardar cambios" : "Registrar ingreso"}
        </Button>
      </div>
    </form>
  );
}
