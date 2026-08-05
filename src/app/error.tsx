"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-lg px-6 py-24 text-center">
      <h2 className="text-lg font-semibold text-rose-700">Algo salió mal</h2>
      <p className="mt-2 text-sm text-slate-600">
        No se pudo cargar esta sección. Intentá de nuevo; si persiste, revisá la conexión
        con Supabase.
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
      >
        Reintentar
      </button>
    </main>
  );
}
