"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface YaCargado {
  archivo: string;
  cargadoEl: string;
}

/**
 * Estado y flujo de "subir un Excel, con reintento si ya se había cargado"
 * compartido por CargaMasivaFacturas y SubidaPresupuesto: ambas rutas
 * (/api/facturas/carga y /api/presupuestos) hablan el mismo protocolo —
 * FormData con `archivo` (+ campos extra opcionales) y `forzar`, 409 con
 * `yaCargado` si el archivo ya se procesó antes, `{ resumen }` si no.
 *
 * SubidaSap.tsx no usa este hook: sube varios archivos en un solo POST y
 * recibe una respuesta agregada, un protocolo distinto.
 */
export function useCargaArchivo<TResumen>(endpoint: string) {
  const router = useRouter();
  const [subiendo, setSubiendo] = useState(false);
  const [resumen, setResumen] = useState<TResumen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [yaCargado, setYaCargado] = useState<YaCargado | null>(null);
  const [ultimo, setUltimo] = useState<File | null>(null);

  async function subir(
    archivo: File,
    opciones: { forzar?: boolean; camposExtra?: Record<string, string> } = {},
  ): Promise<void> {
    setUltimo(archivo);
    setSubiendo(true);
    setError(null);
    setResumen(null);
    setYaCargado(null);

    try {
      const formData = new FormData();
      formData.append("archivo", archivo);
      if (opciones.forzar) formData.append("forzar", "true");
      for (const [clave, valor] of Object.entries(opciones.camposExtra ?? {})) {
        formData.append(clave, valor);
      }

      const res = await fetch(endpoint, { method: "POST", body: formData });
      const json = (await res.json()) as {
        resumen?: TResumen;
        error?: string;
        yaCargado?: YaCargado;
      };

      if (res.status === 409 && json.yaCargado) {
        setYaCargado(json.yaCargado);
        return;
      }

      if (!res.ok || !json.resumen) {
        setError(json.error ?? "No se pudo procesar el archivo.");
        return;
      }

      setResumen(json.resumen);
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setSubiendo(false);
    }
  }

  return { subiendo, resumen, error, yaCargado, ultimo, subir };
}
