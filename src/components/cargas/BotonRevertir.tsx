"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";

interface Props {
  idCarga: string;
  nombreArchivo: string;
}

interface Conteo {
  total: number;
  revisadas: number;
  intactas: number;
}

/**
 * Deshace una carga borrando los gastos que insertó.
 *
 * La confirmación pide escribir el nombre del archivo a mano — el mismo
 * criterio que valida el servidor — porque el historial muestra varias cargas
 * parecidas y equivocarse de fila acá borra datos reales.
 */
export function BotonRevertir({ idCarga, nombreArchivo }: Props) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [conteo, setConteo] = useState<Conteo | null>(null);
  const [texto, setTexto] = useState("");
  const [incluirRevisadas, setIncluirRevisadas] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abrir = useCallback(async () => {
    setAbierto(true);
    setTexto("");
    setIncluirRevisadas(false);
    setError(null);
    setConteo(null);

    try {
      const res = await fetch(`/api/cargas/${idCarga}/revertir`);
      const json = (await res.json()) as Conteo & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "No se pudo leer la carga.");
        return;
      }
      setConteo({ total: json.total, revisadas: json.revisadas, intactas: json.intactas });
    } catch {
      setError("No se pudo conectar con el servidor.");
    }
  }, [idCarga]);

  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (e.key === "Escape" && !trabajando) setAbierto(false);
    }
    if (abierto) document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, [abierto, trabajando]);

  async function revertir() {
    setTrabajando(true);
    setError(null);
    try {
      const res = await fetch(`/api/cargas/${idCarga}/revertir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmacion: texto, incluirRevisadas }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "No se pudo revertir la carga.");
        return;
      }
      setAbierto(false);
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setTrabajando(false);
    }
  }

  const aBorrar = conteo
    ? incluirRevisadas
      ? conteo.total
      : conteo.intactas
    : 0;

  return (
    <>
      <button
        type="button"
        onClick={() => void abrir()}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-rose-50 hover:text-rose-700"
      >
        Deshacer
      </button>

      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => {
            if (!trabajando) setAbierto(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-revertir"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
          >
            <h2 id="titulo-revertir" className="text-lg font-semibold text-slate-900">
              Deshacer esta carga
            </h2>
            <p className="mt-1 break-all text-sm text-slate-600">{nombreArchivo}</p>

            {conteo === null && !error && (
              <p className="mt-4 text-sm text-slate-500">Contando filas…</p>
            )}

            {conteo && (
              <div className="mt-4 space-y-3 text-sm text-slate-700">
                <p>
                  Esta carga insertó <strong>{conteo.total}</strong>{" "}
                  {conteo.total === 1 ? "gasto" : "gastos"}.
                </p>

                {conteo.revisadas > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                    <p>
                      <strong>{conteo.revisadas}</strong> ya pasaron por triaje: alguien las
                      clasificó a mano. Por defecto se conservan.
                    </p>
                    <label className="mt-2 flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={incluirRevisadas}
                        onChange={(e) => setIncluirRevisadas(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>Borrarlas también (se pierde esa clasificación)</span>
                    </label>
                  </div>
                )}

                <p className="rounded-md bg-rose-50 px-3 py-2 text-rose-800">
                  Se borrarán <strong>{aBorrar}</strong>{" "}
                  {aBorrar === 1 ? "gasto" : "gastos"}. No se puede deshacer.
                </p>

                <label className="block">
                  <span className="text-xs text-slate-600">
                    Escribe el nombre del archivo para confirmar
                  </span>
                  <input
                    type="text"
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder={nombreArchivo}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </label>
              </div>
            )}

            {error && (
              <p role="alert" className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variante="secundario"
                disabled={trabajando}
                onClick={() => setAbierto(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={trabajando || texto !== nombreArchivo || aBorrar === 0}
                onClick={() => void revertir()}
              >
                {trabajando ? "Borrando…" : `Borrar ${aBorrar}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
