"use client";

import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";

import { CampoSugerido, ListaSugerencias } from "@/components/ui/CampoSugerido";

export interface GastoPendiente {
  id: string;
  fecha_documento: string;
  factura: string | null;
  proveedor: string | null;
  proveedor_codigo: string | null;
  texto_referencia: string | null;
  grupo_clase_coste: string | null;
  monto_real: number;
  ceco_codigo: string | null;
  oi_codigo_raw: string | null;
  codigo_oi: string | null;
  hunting_zone: string | null;
  fase: string | null;
  motivo: string | null;
  detalle: string | null;
  nota: string | null;
}

export interface OpcionAsignacion {
  /** Código de OI o etiqueta #TAG. */
  valor: string;
  descripcion: string;
}

export interface Sugerencias {
  fase: string[];
  motivo: string[];
  detalle: string[];
}

interface Props {
  gastos: GastoPendiente[];
  asignaciones: OpcionAsignacion[];
  sugerencias: Sugerencias;
  totalPendientes: number;
}

interface Borrador {
  asignacion: string;
  fase: string;
  motivo: string;
  detalle: string;
  nota: string;
}

const moneda = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const CLASE_INPUT =
  "block w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300";

export function TablaTriaje({
  gastos,
  asignaciones,
  sugerencias,
  totalPendientes,
}: Props) {
  const router = useRouter();

  const primeraCeldaRef = useRef<Array<HTMLInputElement | null>>([]);
  const [borradores, setBorradores] = useState<Record<string, Borrador>>({});
  const [resueltos, setResueltos] = useState<Set<string>>(new Set());
  const [enProceso, setEnProceso] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const pendientes = useMemo(
    () => gastos.filter((g) => !resueltos.has(g.id)),
    [gastos, resueltos],
  );

  const borradorDe = useCallback(
    (g: GastoPendiente): Borrador =>
      borradores[g.id] ?? {
        asignacion: g.codigo_oi ?? "",
        fase: g.fase ?? "",
        motivo: g.motivo ?? "",
        detalle: g.detalle ?? "",
        nota: g.nota ?? "",
      },
    [borradores],
  );

  const editar = useCallback((id: string, campo: keyof Borrador, valor: string) => {
    setBorradores((prev) => {
      const actual = prev[id] ?? {
        asignacion: "",
        fase: "",
        motivo: "",
        detalle: "",
        nota: "",
      };
      return { ...prev, [id]: { ...actual, [campo]: valor } };
    });
  }, []);

  const enfocar = useCallback((indice: number) => {
    const destino = primeraCeldaRef.current[indice];
    if (destino) {
      destino.focus();
      destino.select();
    }
  }, []);

  const aplicar = useCallback(
    async (
      gasto: GastoPendiente,
      indice: number,
      accion: "guardar" | "archivar",
      aprobar = true,
    ) => {
      setError(null);
      setEnProceso((prev) => new Set(prev).add(gasto.id));

      const b = borradorDe(gasto);

      try {
        const res = await fetch("/api/triaje", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ids: [gasto.id],
            accion,
            aprobar,
            asignacion: b.asignacion,
            fase: b.fase,
            motivo: b.motivo,
            detalle: b.detalle,
            nota: b.nota,
          }),
        });

        const json = (await res.json()) as { error?: string };

        if (!res.ok) {
          setError(json.error ?? "No se pudo aplicar el cambio.");
          return;
        }

        if (aprobar || accion === "archivar") {
          setResueltos((prev) => new Set(prev).add(gasto.id));
          enfocar(indice + 1);
        }
        router.refresh();
      } catch {
        setError("No se pudo conectar con el servidor.");
      } finally {
        setEnProceso((prev) => {
          const copia = new Set(prev);
          copia.delete(gasto.id);
          return copia;
        });
      }
    },
    [borradorDe, enfocar, router],
  );

  function manejarTecla(e: KeyboardEvent<HTMLElement>, gasto: GastoPendiente, i: number) {
    // Ctrl/⌘ + ↑↓ navega entre filas sin perder el Tab dentro de la fila.
    if ((e.ctrlKey || e.metaKey) && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      enfocar(e.key === "ArrowDown" ? i + 1 : i - 1);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "Backspace" || e.key === "Delete")) {
      e.preventDefault();
      void aplicar(gasto, i, "archivar");
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      // Shift+Enter guarda sin aprobar: sirve para dejar avanzado un gasto que
      // todavía necesita más información.
      void aplicar(gasto, i, "guardar", !e.shiftKey);
    }
  }

  if (totalPendientes === 0) {
    return (
      <p className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
        No hay gastos pendientes de triaje.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{pendientes.length}</span> en
          pantalla de {totalPendientes} pendientes
        </p>
        <p className="text-xs text-slate-500">
          <kbd className="rounded border border-slate-300 px-1">Enter</kbd> guarda, aprueba
          y avanza · <kbd className="rounded border border-slate-300 px-1">⇧Enter</kbd>{" "}
          guarda sin aprobar ·{" "}
          <kbd className="rounded border border-slate-300 px-1">Tab</kbd> entre campos ·{" "}
          <kbd className="rounded border border-slate-300 px-1">Ctrl</kbd>+
          <kbd className="rounded border border-slate-300 px-1">↑↓</kbd> entre filas ·{" "}
          <kbd className="rounded border border-slate-300 px-1">Ctrl</kbd>+
          <kbd className="rounded border border-slate-300 px-1">⌫</kbd> archiva
        </p>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {/* Un datalist por campo, compartido por todas las filas: montarlos por
          celda duplicaría el catálogo una vez por gasto. */}
      <datalist id="opciones-asignacion">
        {asignaciones.map((a) => (
          <option key={a.valor} value={a.valor}>
            {a.descripcion}
          </option>
        ))}
      </datalist>
      <ListaSugerencias id="sugerencias-fase" sugerencias={sugerencias.fase} />
      <ListaSugerencias id="sugerencias-motivo" sugerencias={sugerencias.motivo} />
      <ListaSugerencias id="sugerencias-detalle" sugerencias={sugerencias.detalle} />

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[86rem] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 font-medium">Gasto (SAP)</th>
              <th className="px-3 py-2 text-right font-medium">Monto</th>
              <th className="px-3 py-2 font-medium">CeCo / OI</th>
              <th className="px-3 py-2 font-medium">OI o etiqueta</th>
              <th className="px-3 py-2 font-medium">Fase</th>
              <th className="px-3 py-2 font-medium">Motivo</th>
              <th className="px-3 py-2 font-medium">Detalle</th>
              <th className="px-3 py-2 font-medium">Nota</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pendientes.map((g, i) => {
              const b = borradorDe(g);
              const bloqueada = enProceso.has(g.id);

              return (
                <tr key={g.id} className={bloqueada ? "opacity-50" : "focus-within:bg-slate-50"}>
                  <td className="max-w-[24rem] px-3 py-2 align-top">
                    <p className="truncate text-slate-900">{g.texto_referencia ?? "—"}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {g.fecha_documento}
                      {g.factura && ` · Fact. ${g.factura}`}
                      {g.proveedor && ` · ${g.proveedor}`}
                      {g.proveedor_codigo && ` (${g.proveedor_codigo})`}
                    </p>
                    {g.grupo_clase_coste && (
                      <p className="mt-0.5 truncate text-xs text-slate-400">
                        {g.grupo_clase_coste}
                      </p>
                    )}
                  </td>

                  <td className="whitespace-nowrap px-3 py-2 text-right align-top tabular-nums text-slate-900">
                    {moneda.format(g.monto_real)}
                  </td>

                  <td className="whitespace-nowrap px-3 py-2 align-top text-xs text-slate-500">
                    <p>{g.ceco_codigo ?? "sin CeCo"}</p>
                    <p className="mt-0.5">{g.oi_codigo_raw ?? "sin OI"}</p>
                  </td>

                  <td className="px-3 py-2 align-top">
                    <input
                      ref={(el) => {
                        primeraCeldaRef.current[i] = el;
                      }}
                      list="opciones-asignacion"
                      autoComplete="off"
                      disabled={bloqueada}
                      value={b.asignacion}
                      placeholder="9000101982 o #CAM"
                      aria-label="Orden Interna o etiqueta"
                      onChange={(e) => editar(g.id, "asignacion", e.target.value)}
                      onKeyDown={(e) => manejarTecla(e, g, i)}
                      className={`${CLASE_INPUT} w-44`}
                    />
                    {g.hunting_zone && (
                      <p className="mt-1 truncate text-xs text-emerald-700">
                        {g.hunting_zone}
                      </p>
                    )}
                  </td>

                  <td className="px-3 py-2 align-top">
                    <CampoSugerido
                      idLista="sugerencias-fase"
                      disabled={bloqueada}
                      value={b.fase}
                      aria-label="Fase"
                      onChange={(e) => editar(g.id, "fase", e.target.value)}
                      onKeyDown={(e) => manejarTecla(e, g, i)}
                      className={`${CLASE_INPUT} w-40`}
                    />
                  </td>

                  <td className="px-3 py-2 align-top">
                    <CampoSugerido
                      idLista="sugerencias-motivo"
                      disabled={bloqueada}
                      value={b.motivo}
                      aria-label="Motivo"
                      onChange={(e) => editar(g.id, "motivo", e.target.value)}
                      onKeyDown={(e) => manejarTecla(e, g, i)}
                      className={`${CLASE_INPUT} w-40`}
                    />
                  </td>

                  <td className="px-3 py-2 align-top">
                    <CampoSugerido
                      idLista="sugerencias-detalle"
                      disabled={bloqueada}
                      value={b.detalle}
                      aria-label="Detalle"
                      onChange={(e) => editar(g.id, "detalle", e.target.value)}
                      onKeyDown={(e) => manejarTecla(e, g, i)}
                      className={`${CLASE_INPUT} w-40`}
                    />
                  </td>

                  <td className="px-3 py-2 align-top">
                    <input
                      disabled={bloqueada}
                      value={b.nota}
                      placeholder="Comentario"
                      aria-label="Nota"
                      onChange={(e) => editar(g.id, "nota", e.target.value)}
                      onKeyDown={(e) => manejarTecla(e, g, i)}
                      className={`${CLASE_INPUT} w-44`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pendientes.length === 0 && (
        <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Lote resuelto. Recargá para traer los siguientes pendientes.
        </p>
      )}
    </div>
  );
}
