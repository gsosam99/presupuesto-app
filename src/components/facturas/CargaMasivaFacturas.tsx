"use client";

import { useRef } from "react";

import { Button } from "@/components/ui/Button";
import { useCargaArchivo } from "@/hooks/useCargaArchivo";

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
  const inputRef = useRef<HTMLInputElement>(null);
  const { subiendo, resumen, error, yaCargado, ultimo, subir } =
    useCargaArchivo<Resumen>("/api/facturas/carga");

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

      {yaCargado && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p>
            <span className="font-medium">{yaCargado.archivo}</span> ya se cargó el{" "}
            {new Date(yaCargado.cargadoEl).toLocaleString("es-VE", { dateStyle: "short" })}.
            No se procesó de nuevo.
          </p>
          <Button
            type="button"
            variante="secundario"
            className="mt-2"
            disabled={subiendo || !ultimo}
            onClick={() => ultimo && void subir(ultimo, { forzar: true })}
          >
            Cargar igual
          </Button>
        </div>
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
