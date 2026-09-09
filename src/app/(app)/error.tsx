"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/Button";

/**
 * Error boundary del área autenticada.
 *
 * Existe además del de la raíz para que un fallo de datos no se lleve puesto el
 * layout: acá el sidebar sigue en pie y el usuario puede irse a otra pantalla
 * sin recargar. Lo dispara sobre todo /fondos, que es la única página que lanza
 * en vez de renderizar el error inline (obtenerDisponibilidad, en
 * src/lib/presupuesto/disponibilidad.ts, hace throw si la RPC falla).
 */
export default function ErrorArea({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app]", error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-lg px-6 py-24 text-center">
      <p className="ui-eyebrow">Error</p>
      <h2 className="ui-title">No se pudo cargar esta sección</h2>
      <p className="ui-lead mx-auto">
        Reintenta; si el problema sigue, revisa la conexión con Supabase o si falta correr
        alguna migración de <code>supabase/schema.sql</code>.
      </p>
      {error.digest && (
        <p className="mt-3 font-mono text-xs text-[var(--muted)]">ref: {error.digest}</p>
      )}
      <Button type="button" className="mt-6" onClick={reset}>
        Reintentar
      </Button>
    </main>
  );
}
