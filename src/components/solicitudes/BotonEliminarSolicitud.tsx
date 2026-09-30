"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  id: string;
  aprobada: boolean;
  /** Extra plan aprobado: borrarlo descarga sus líneas del presupuesto. */
  cargaPresupuesto: boolean;
  /** Tras eliminar, navegar acá (desde el detalle). Sin valor, solo refresca. */
  redirigirA?: string;
}

/** Eliminar con confirmación en línea: el visor no garantiza confirm(). */
export function BotonEliminarSolicitud({ id, aprobada, cargaPresupuesto, redirigirA }: Props) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function eliminar() {
    setOcupado(true);
    setError(null);
    try {
      const res = await fetch(`/api/solicitudes/${id}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "No se pudo eliminar.");
        return;
      }
      if (redirigirA) router.push(redirigirA);
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setOcupado(false);
    }
  }

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="text-xs font-semibold text-[var(--bad)] hover:underline"
      >
        Eliminar
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs">
      <span className="text-[var(--ink-soft)]">
        {aprobada
          ? cargaPresupuesto
            ? "Está aprobada: se descargan sus líneas del presupuesto."
            : "Está aprobada: deja de afectar los fondos."
          : "¿Eliminar?"}
      </span>
      <button
        type="button"
        disabled={ocupado}
        onClick={() => void eliminar()}
        className="font-semibold text-[var(--bad)] hover:underline disabled:opacity-50"
      >
        {ocupado ? "Eliminando…" : "Sí, eliminar"}
      </button>
      <button
        type="button"
        disabled={ocupado}
        onClick={() => setConfirmando(false)}
        className="text-[var(--muted)] hover:underline"
      >
        No
      </button>
      {error && (
        <span role="alert" className="text-[var(--bad)]">
          {error}
        </span>
      )}
    </span>
  );
}
