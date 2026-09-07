"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { useCargaArchivo } from "@/hooks/useCargaArchivo";
import { moneda } from "@/lib/format";

interface Resumen {
  idCarga: string;
  nombreArchivo: string;
  tipo: "plan" | "extra_plan";
  filasLeidas: number;
  insertadas: number;
  rechazadas: number;
  montoTotal: number;
  porFy: Array<{ fy: number; etiqueta: string; monto: number; filas: number }>;
  oisDesconocidas: string[];
  rechazos: Array<{ fila: number; motivo: string }>;
}

export function SubidaPresupuesto() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [tipo, setTipo] = useState<"plan" | "extra_plan">("plan");
  const { subiendo, resumen, error, yaCargado, ultimo, subir } =
    useCargaArchivo<Resumen>("/api/presupuestos");

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <fieldset>
        <legend className="text-sm font-medium text-slate-700">
          ¿Qué estás cargando?
        </legend>
        <p className="mt-1 text-xs text-slate-500">
          Los formatos no traen una columna que los distinga, así que hay que indicarlo acá.
        </p>

        <div className="mt-3 flex flex-wrap gap-4">
          {(
            [
              ["plan", "Plan base"],
              ["extra_plan", "Extra Plan (suplemento)"],
            ] as const
          ).map(([valor, etiqueta]) => (
            <label key={valor} className="flex items-center gap-2 text-sm text-slate-900">
              <input
                type="radio"
                name="tipo-presupuesto"
                value={valor}
                checked={tipo === valor}
                onChange={() => setTipo(valor)}
                className="h-4 w-4 border-slate-300 text-slate-900 focus:ring-slate-300"
              />
              {etiqueta}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-4">
        <Button
          type="button"
          disabled={subiendo}
          onClick={() => inputRef.current?.click()}
        >
          {subiendo ? "Procesando…" : "Subir Excel de presupuesto"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xlsm"
          className="sr-only"
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            if (archivo) void subir(archivo, { camposExtra: { tipo } });
            e.target.value = "";
          }}
        />
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {yaCargado && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p>
            <span className="font-medium">{yaCargado.archivo}</span> ya se cargó el{" "}
            {new Date(yaCargado.cargadoEl).toLocaleString("es-VE", { dateStyle: "short" })}.
            Volver a procesarlo duplicaría las líneas presupuestarias.
          </p>
          <Button
            type="button"
            variante="secundario"
            className="mt-2"
            disabled={subiendo || !ultimo}
            onClick={() => ultimo && void subir(ultimo, { forzar: true, camposExtra: { tipo } })}
          >
            Cargar igual
          </Button>
        </div>
      )}

      {resumen && (
        <article className="mt-4 rounded-md border border-slate-200 p-3">
          <p className="text-sm text-slate-900">
            <span className="font-medium">{resumen.nombreArchivo}</span> ·{" "}
            {resumen.tipo === "plan" ? "Plan base" : "Extra Plan"} ·{" "}
            {resumen.insertadas} líneas de {resumen.filasLeidas}
            {resumen.rechazadas > 0 && ` · ${resumen.rechazadas} rechazadas`}
          </p>

          <p className="mt-1 text-sm text-slate-600">
            Total cargado:{" "}
            <span className="font-medium text-slate-900">
              {moneda.format(resumen.montoTotal)}
            </span>
          </p>

          {resumen.porFy.length > 0 && (
            <table className="mt-3 text-sm">
              <tbody>
                {resumen.porFy.map((f) => (
                  <tr key={f.fy}>
                    <td className="pr-4 text-slate-500">FY {f.etiqueta}</td>
                    <td className="pr-4 tabular-nums text-slate-600">{f.filas} líneas</td>
                    <td className="tabular-nums text-slate-900">{moneda.format(f.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {resumen.oisDesconocidas.length > 0 && (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Órdenes internas que no están en la maestra:{" "}
              <span className="font-mono">{resumen.oisDesconocidas.join(", ")}</span>. Esas
              líneas no se cargaron: agrega la OI y vuelve a subir el archivo.
            </p>
          )}

          {resumen.rechazos.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-amber-800">
              {resumen.rechazos.map((r) => (
                <li key={`${r.fila}-${r.motivo}`}>
                  Fila {r.fila}: {r.motivo}
                </li>
              ))}
            </ul>
          )}
        </article>
      )}
    </div>
  );
}
