"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";

interface Resumen {
  idCarga: string;
  nombreArchivo: string;
  filasLeidas: number;
  insertadas: number;
  rechazadas: number;
  rechazos: Array<{ fila: number; motivo: string }>;
}

const COLUMNAS = [
  "Número de factura",
  "Número de cuenta proveedor o acreedor",
  "Fecha",
  "Texto de referencia",
  "Orden Interna",
  "Hunting Zone",
  "Fase",
  "Motivo",
  "Detalle",
  "Monto",
  "Moneda",
  "Nota",
];

export function CargaMasivaFacturas() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function subir(archivo: File) {
    setSubiendo(true);
    setError(null);
    setResumen(null);

    try {
      const formData = new FormData();
      formData.append("archivo", archivo);

      const res = await fetch("/api/facturas/carga", { method: "POST", body: formData });
      const json = (await res.json()) as { resumen?: Resumen; error?: string };

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

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">Carga masiva desde Excel</h3>
      <p className="mt-1 text-sm text-slate-600">
        Solo <span className="font-medium">Número de factura</span> es obligatorio. Los
        encabezados se reconocen sin importar acentos ni mayúsculas.
      </p>

      <ul className="mt-3 flex flex-wrap gap-1.5">
        {COLUMNAS.map((c) => (
          <li
            key={c}
            className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs text-slate-600"
          >
            {c}
          </li>
        ))}
      </ul>

      <div className="mt-4">
        <Button
          type="button"
          variante="secundario"
          disabled={subiendo}
          onClick={() => inputRef.current?.click()}
        >
          {subiendo ? "Procesando…" : "Subir Excel de facturas"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xlsm"
          className="sr-only"
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            if (archivo) void subir(archivo);
            e.target.value = "";
          }}
        />
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {resumen && (
        <div className="mt-4 rounded-md border border-slate-200 p-3 text-sm">
          <p className="text-slate-900">
            <span className="font-medium">{resumen.nombreArchivo}</span>:{" "}
            {resumen.insertadas} registradas de {resumen.filasLeidas} leídas
            {resumen.rechazadas > 0 && ` · ${resumen.rechazadas} rechazadas`}
          </p>

          {resumen.rechazos.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-amber-800">
              {resumen.rechazos.map((r) => (
                <li key={`${r.fila}-${r.motivo}`}>
                  Fila {r.fila}: {r.motivo}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
