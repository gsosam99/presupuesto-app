"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { BotonEliminarSolicitud } from "@/components/solicitudes/BotonEliminarSolicitud";
import { Button } from "@/components/ui/Button";
import { AYUDA, CONTROL, ETIQUETA } from "@/components/ui/estilos";
import type { EstadoSolicitud, TipoSolicitud } from "@/types";

const MENSAJE_APROBADA: Record<TipoSolicitud, string> = {
  extra_plan:
    "Aprobada: sus líneas ya están cargadas como extra plan y suman como suplemento a los fondos.",
  reclasificacion:
    "Aprobada: los montos salen de la orden de origen (devolución) y entran a la de destino (suplemento).",
  provision:
    "Aprobada: al cierre del trimestre ese monto no se retira; pasa al trimestre siguiente, hasta lo que efectivamente sobró.",
  ahorro: "Aprobada: los montos se devuelven a finanzas y ya no cuentan como disponibles.",
};

interface Props {
  id: string;
  tipo: TipoSolicitud;
  estado: EstadoSolicitud;
  referenciaActual: string | null;
  /** Enviar y devolver a borrador (solicitudes:crear). */
  puedeGestionar: boolean;
  /** Aprobar, rechazar y revertir la aprobación (solicitudes:resolver). */
  puedeResolver: boolean;
}

export function AccionesSolicitud({
  id,
  tipo,
  estado,
  referenciaActual,
  puedeGestionar,
  puedeResolver,
}: Props) {
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

      {(tipo === "extra_plan" || tipo === "reclasificacion" || tipo === "ahorro") && (
        <a
          href={`/api/solicitudes/${id}/excel`}
          className="mt-3 inline-flex rounded-md border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold text-[var(--blue)] hover:bg-[var(--line-soft)]"
        >
          Descargar Excel para finanzas
        </a>
      )}

      {estado === "borrador" && puedeGestionar && (
        <div className="mt-4">
          <Button type="button" disabled={enProceso} onClick={() => void cambiar("enviada")}>
            Marcar como enviada
          </Button>
          <p className={AYUDA}>Congela la solicitud mientras Charles y finanzas la revisan.</p>
        </div>
      )}

      {estado === "enviada" && (puedeResolver || puedeGestionar) && (
        <div className="mt-4 space-y-3">
          {puedeResolver && (
            <>
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
                <p className={AYUDA}>Queda como respaldo de quién aprobó fuera de la app.</p>
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
            </>
          )}

          <div className="flex flex-wrap gap-2">
            {puedeResolver && (
              <>
                <button
                  type="button"
                  disabled={enProceso}
                  onClick={() => void cambiar("aprobada")}
                  className="rounded-md bg-[var(--ok)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {tipo === "extra_plan" ? "Aprobar y cargar al presupuesto" : "Aprobar"}
                </button>
                <button
                  type="button"
                  disabled={enProceso}
                  onClick={() => void cambiar("rechazada")}
                  className="rounded-md bg-[var(--bad)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  Rechazar
                </button>
              </>
            )}
            {puedeGestionar && (
              <Button
                type="button"
                variante="secundario"
                disabled={enProceso}
                onClick={() => void cambiar("borrador")}
              >
                Volver a borrador
              </Button>
            )}
          </div>
        </div>
      )}

      {estado === "aprobada" && (
        <div className="mt-4">
          <p className="rounded-md bg-[rgba(30,138,138,0.1)] px-3 py-2 text-sm text-[var(--ok)]">
            {MENSAJE_APROBADA[tipo]}
          </p>
          {puedeResolver && (
            <>
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
                  : "Deja de afectar los fondos hasta que se vuelva a aprobar."}
              </p>
            </>
          )}
        </div>
      )}

      {estado === "rechazada" && puedeGestionar && (
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

      {(estado === "aprobada" ? puedeResolver : puedeGestionar) && (
        <div className="mt-6 border-t border-[var(--line-soft)] pt-3">
          <BotonEliminarSolicitud
            id={id}
            aprobada={estado === "aprobada"}
            cargaPresupuesto={tipo === "extra_plan"}
            redirigirA="/solicitudes"
          />
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-[var(--bad)]">
          {error}
        </p>
      )}
    </div>
  );
}
