"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { AYUDA, CONTROL, ETIQUETA } from "@/components/ui/estilos";
import type { EstadoSolicitud, TipoSolicitud } from "@/types";

interface Props {
  id: string;
  tipo: TipoSolicitud;
  estado: EstadoSolicitud;
  referenciaActual: string | null;
}

export function AccionesSolicitud({ id, tipo, estado, referenciaActual }: Props) {
  const router = useRouter();
  const [enProceso, setEnProceso] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referencia, setReferencia] = useState(referenciaActual ?? "");
  const [nota, setNota] = useState("");

  async function cambiar(destino: EstadoSolicitud) {
    setEnProceso(true);
    setError(null);

    try {
      const res = await fetch(`/api/solicitudes/${id}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estado: destino,
          referencia_aprobacion: referencia,
          nota_resolucion: nota,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "No se pudo cambiar el estado.");
        return;
      }
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setEnProceso(false);
    }
  }

  return (
    <div className="ui-card p-4">
      <h2 className="ui-section-title">Acciones</h2>

      {tipo === "extra_plan" && (
        <a
          href={`/api/solicitudes/${id}/excel`}
          className="mt-3 inline-flex rounded-md border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold text-[var(--blue)] hover:bg-[var(--line-soft)]"
        >
          Descargar Excel para finanzas
        </a>
      )}

      {estado === "borrador" && (
        <div className="mt-4">
          <Button type="button" disabled={enProceso} onClick={() => void cambiar("enviada")}>
            Marcar como enviada
          </Button>
          <p className={AYUDA}>
            Congela la solicitud mientras Charles y finanzas la revisan.
          </p>
        </div>
      )}

      {estado === "enviada" && (
        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="referencia" className={ETIQUETA}>
              Referencia de la aprobación
            </label>
            <input
              id="referencia"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Correo, número de trámite…"
              className={`mt-1 ${CONTROL}`}
            />
            <p className={AYUDA}>
              Queda como respaldo de quién aprobó fuera de la app.
            </p>
          </div>

          <div>
            <label htmlFor="nota" className={ETIQUETA}>
              Nota
            </label>
            <input
              id="nota"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              className={`mt-1 ${CONTROL}`}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={enProceso}
              onClick={() => void cambiar("aprobada")}
              className="rounded-md bg-[var(--ok)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              Aprobar y cargar al presupuesto
            </button>
            <button
              type="button"
              disabled={enProceso}
              onClick={() => void cambiar("rechazada")}
              className="rounded-md bg-[var(--bad)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              Rechazar
            </button>
            <Button
              type="button"
              variante="secundario"
              disabled={enProceso}
              onClick={() => void cambiar("borrador")}
            >
              Volver a borrador
            </Button>
          </div>
        </div>
      )}

      {estado === "aprobada" && (
        <div className="mt-4">
          <p className="rounded-md bg-[rgba(30,138,138,0.1)] px-3 py-2 text-sm text-[var(--ok)]">
            {tipo === "extra_plan"
              ? "Aprobada: sus líneas ya están cargadas como extra plan y suman a los fondos disponibles."
              : "Aprobada: el sobrante de ese trimestre se arrastra al siguiente."}
          </p>
          <Button
            type="button"
            variante="secundario"
            className="mt-3"
            disabled={enProceso}
            onClick={() => void cambiar("enviada")}
          >
            Revertir aprobación
          </Button>
          <p className={AYUDA}>
            {tipo === "extra_plan"
              ? "Descarta del presupuesto las líneas que había cargado."
              : "El sobrante vuelve a perderse."}
          </p>
        </div>
      )}

      {estado === "rechazada" && (
        <Button
          type="button"
          variante="secundario"
          className="mt-4"
          disabled={enProceso}
          onClick={() => void cambiar("borrador")}
        >
          Reabrir como borrador
        </Button>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-[var(--bad)]">
          {error}
        </p>
      )}
    </div>
  );
}
