"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useAvisos } from "@/components/ui/Avisos";
import { ModalConfirmacion } from "@/components/ui/ModalConfirmacion";

interface Props {
  id: string;
  titulo: string;
  aprobada: boolean;
  /** Extra plan aprobado: borrarlo descarga sus líneas del presupuesto. */
  cargaPresupuesto: boolean;
  /** Tras eliminar, navegar acá (desde el detalle). Sin valor, solo refresca. */
  redirigirA?: string;
}

/** Eliminar una solicitud, con confirmación en un modal. */
export function BotonEliminarSolicitud({
  id,
  titulo,
  aprobada,
  cargaPresupuesto,
  redirigirA,
}: Props) {
  const router = useRouter();
  const avisos = useAvisos();
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  async function eliminar() {
    setOcupado(true);
    try {
      const res = await fetch(`/api/solicitudes/${id}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        avisos.error(json.error ?? "No se pudo eliminar la solicitud.");
        return;
      }
      setConfirmando(false);
      avisos.exito(`Solicitud "${titulo}" eliminada.`);
      if (redirigirA) router.push(redirigirA);
      router.refresh();
    } catch {
      avisos.error("No se pudo conectar con el servidor.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="text-xs font-semibold text-[var(--bad)] hover:underline"
      >
        Eliminar
      </button>

      {confirmando && (
        <ModalConfirmacion
          titulo="Eliminar solicitud"
          textoConfirmar="Eliminar"
          peligro
          procesando={ocupado}
          onConfirmar={() => void eliminar()}
          onCancelar={() => setConfirmando(false)}
        >
          <p>
            Se elimina <strong>{titulo}</strong> con todas sus líneas. No se puede recuperar.
          </p>
          {aprobada && (
            <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-amber-900">
              {cargaPresupuesto
                ? "Está aprobada: sus líneas se descargan del presupuesto y dejan de sumar a los fondos."
                : "Está aprobada: deja de afectar los fondos."}
            </p>
          )}
        </ModalConfirmacion>
      )}
    </>
  );
}
