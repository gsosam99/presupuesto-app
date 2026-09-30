"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type TipoAviso = "exito" | "error";

interface Aviso {
  id: number;
  tipo: TipoAviso;
  texto: string;
}

interface ApiAvisos {
  exito: (texto: string) => void;
  error: (texto: string) => void;
}

const ContextoAvisos = createContext<ApiAvisos | null>(null);

/** Cuánto queda visible cada aviso. Los errores, más: hay que leerlos. */
const DURACION: Record<TipoAviso, number> = { exito: 5000, error: 9000 };

/**
 * Notificaciones flotantes de éxito y error de las tablas. Aparecen abajo a
 * la derecha, se apilan y se cierran solas; así no empujan la tabla hacia
 * abajo ni se quedan olvidadas encima de ella.
 */
export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const siguienteId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const cerrar = useCallback((id: number) => {
    setAvisos((prev) => prev.filter((a) => a.id !== id));
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
  }, []);

  const agregar = useCallback(
    (tipo: TipoAviso, texto: string) => {
      siguienteId.current += 1;
      const id = siguienteId.current;
      // Máximo 4 a la vez: los más viejos se van primero.
      setAvisos((prev) => [...prev.slice(-3), { id, tipo, texto }]);
      timers.current.set(
        id,
        setTimeout(() => cerrar(id), DURACION[tipo]),
      );
    },
    [cerrar],
  );

  useEffect(() => {
    const activos = timers.current;
    return () => {
      for (const t of activos.values()) clearTimeout(t);
      activos.clear();
    };
  }, []);

  const api = useMemo<ApiAvisos>(
    () => ({
      exito: (texto) => agregar("exito", texto),
      error: (texto) => agregar("error", texto),
    }),
    [agregar],
  );

  return (
    <ContextoAvisos.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-6 sm:w-96"
        style={{ bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
      >
        {avisos.map((a) => (
          <div
            key={a.id}
            role={a.tipo === "error" ? "alert" : "status"}
            className={
              "pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg " +
              (a.tipo === "error"
                ? "border-rose-200 bg-rose-50 text-rose-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-900")
            }
          >
            <span aria-hidden className="font-bold">
              {a.tipo === "error" ? "!" : "✓"}
            </span>
            <p className="flex-1">{a.texto}</p>
            <button
              type="button"
              aria-label="Cerrar aviso"
              onClick={() => cerrar(a.id)}
              className="opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ContextoAvisos.Provider>
  );
}

/** Avisos flotantes. Fuera del proveedor no falla: cae a la consola de error. */
export function useAvisos(): ApiAvisos {
  const api = useContext(ContextoAvisos);
  return (
    api ?? {
      exito: () => undefined,
      error: (texto) => console.error(texto),
    }
  );
}
