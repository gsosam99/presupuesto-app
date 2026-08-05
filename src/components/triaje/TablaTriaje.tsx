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
  ceco_codigo_raw: string | null;
  oi_codigo_raw: string | null;
  codigo_oi: string | null;
  hunting_zone: string | null;
  fase: string | null;
  motivo: string | null;
  detalle: string | null;
  nota: string | null;
}

export interface OpcionAsignacion {
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

type Columna =
  | "fecha"
  | "texto"
  | "proveedor"
  | "factura"
  | "monto"
  | "ceco"
  | "asignacion"
  | "fase"
  | "motivo"
  | "detalle"
  | "nota";

const POR_PAGINA = [25, 50, 100, 250] as const;

const moneda = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Celdas compactas: la grilla prioriza densidad y hace scroll horizontal. */
const CELDA =
  "block w-full rounded border border-[var(--line)] bg-white px-1.5 py-1 text-xs " +
  "text-[var(--ink)] focus:outline-none focus:border-[var(--blue)] " +
  "focus:ring-2 focus:ring-[rgba(46,117,182,0.18)]";

function valorColumna(g: GastoPendiente, c: Columna): string | number {
  switch (c) {
    case "monto":
      return g.monto_real;
    case "texto":
      return g.texto_referencia ?? "";
    case "proveedor":
      return g.proveedor ?? "";
    case "factura":
      return g.factura ?? "";
    case "ceco":
      return g.ceco_codigo ?? g.ceco_codigo_raw ?? "";
    case "asignacion":
      return g.codigo_oi ?? g.oi_codigo_raw ?? "";
    case "fase":
      return g.fase ?? "";
    case "motivo":
      return g.motivo ?? "";
    case "detalle":
      return g.detalle ?? "";
    case "nota":
      return g.nota ?? "";
    default:
      return g.fecha_documento;
  }
}

function Th({
  columna,
  orden,
  onOrdenar,
  ancho,
  alineado = "izquierda",
  children,
}: {
  columna: Columna;
  orden: { columna: Columna; asc: boolean };
  onOrdenar: (c: Columna) => void;
  ancho?: string;
  alineado?: "izquierda" | "derecha";
  children: string;
}) {
  const activa = orden.columna === columna;
  return (
    <th
      className={`whitespace-nowrap px-2 py-1.5 font-medium ${ancho ?? ""} ${
        alineado === "derecha" ? "text-right" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => onOrdenar(columna)}
        className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-900"
      >
        {children}
        <span className={activa ? "text-slate-900" : "text-slate-300"}>
          {activa && !orden.asc ? "▾" : "▴"}
        </span>
      </button>
    </th>
  );
}

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
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());

  const [filtro, setFiltro] = useState("");
  const [orden, setOrden] = useState<{ columna: Columna; asc: boolean }>({
    columna: "fecha",
    asc: false,
  });
  const [porPagina, setPorPagina] = useState<number>(25);
  const [pagina, setPagina] = useState(0);

  const visibles = useMemo(() => {
    const texto = filtro.trim().toLowerCase();

    const filtrados = gastos.filter((g) => {
      if (resueltos.has(g.id)) return false;
      if (texto === "") return true;
      return [
        g.texto_referencia,
        g.proveedor,
        g.proveedor_codigo,
        g.factura,
        g.grupo_clase_coste,
        g.ceco_codigo_raw,
        g.oi_codigo_raw,
        g.fase,
        g.motivo,
        g.detalle,
        String(g.monto_real),
      ]
        .filter((v): v is string => typeof v === "string")
        .some((v) => v.toLowerCase().includes(texto));
    });

    const signo = orden.asc ? 1 : -1;
    return [...filtrados].sort((a, b) => {
      const va = valorColumna(a, orden.columna);
      const vb = valorColumna(b, orden.columna);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * signo;
      return String(va).localeCompare(String(vb), "es") * signo;
    });
  }, [gastos, resueltos, filtro, orden]);

  const totalPaginas = Math.max(1, Math.ceil(visibles.length / porPagina));
  const paginaActual = Math.min(pagina, totalPaginas - 1);
  const enPagina = visibles.slice(
    paginaActual * porPagina,
    paginaActual * porPagina + porPagina,
  );

  const montoVisible = visibles.reduce((s, g) => s + g.monto_real, 0);
  const seleccionados = enPagina.filter((g) => seleccion.has(g.id));
  const todosMarcados = enPagina.length > 0 && seleccionados.length === enPagina.length;

  function ordenarPor(columna: Columna) {
    setOrden((o) =>
      o.columna === columna ? { columna, asc: !o.asc } : { columna, asc: true },
    );
    setPagina(0);
  }

  function alternar(id: string) {
    setSeleccion((prev) => {
      const copia = new Set(prev);
      if (copia.has(id)) copia.delete(id);
      else copia.add(id);
      return copia;
    });
  }

  function alternarTodos() {
    setSeleccion((prev) => {
      const copia = new Set(prev);
      if (todosMarcados) for (const g of enPagina) copia.delete(g.id);
      else for (const g of enPagina) copia.add(g.id);
      return copia;
    });
  }

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

  /** Aplica una acción sobre una fila (con su borrador) o sobre la selección. */
  const aplicar = useCallback(
    async (
      objetivo: GastoPendiente[],
      accion: "guardar" | "archivar",
      aprobar: boolean,
      indiceSiguiente?: number,
    ) => {
      if (objetivo.length === 0) return;
      setError(null);
      setEnProceso((prev) => new Set([...prev, ...objetivo.map((g) => g.id)]));

      try {
        // En lote no se envían campos de edición: solo cambia el estado.
        const enLote = objetivo.length > 1;
        const b = enLote ? null : borradorDe(objetivo[0]);

        const res = await fetch("/api/triaje", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ids: objetivo.map((g) => g.id),
            accion,
            aprobar,
            ...(b
              ? {
                  asignacion: b.asignacion,
                  fase: b.fase,
                  motivo: b.motivo,
                  detalle: b.detalle,
                  nota: b.nota,
                }
              : {}),
          }),
        });

        const json = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(json.error ?? "No se pudo aplicar el cambio.");
          return;
        }

        if (aprobar || accion === "archivar") {
          setResueltos((prev) => new Set([...prev, ...objetivo.map((g) => g.id)]));
          setSeleccion((prev) => {
            const copia = new Set(prev);
            for (const g of objetivo) copia.delete(g.id);
            return copia;
          });
          if (indiceSiguiente !== undefined) enfocar(indiceSiguiente);
        }
        router.refresh();
      } catch {
        setError("No se pudo conectar con el servidor.");
      } finally {
        setEnProceso((prev) => {
          const copia = new Set(prev);
          for (const g of objetivo) copia.delete(g.id);
          return copia;
        });
      }
    },
    [borradorDe, enfocar, router],
  );

  function manejarTecla(e: KeyboardEvent<HTMLElement>, gasto: GastoPendiente, i: number) {
    if ((e.ctrlKey || e.metaKey) && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      enfocar(e.key === "ArrowDown" ? i + 1 : i - 1);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "Backspace" || e.key === "Delete")) {
      e.preventDefault();
      void aplicar([gasto], "archivar", true, i + 1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      void aplicar([gasto], "guardar", !e.shiftKey, i + 1);
    }
  }

  if (totalPendientes === 0) {
    return (
      <p className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
        No hay gastos pendientes de triaje.
      </p>
    );
  }

  const haySeleccion = seleccionados.length > 0;

  return (
    <div>
      {/* Barra de herramientas: filtros o acciones sobre la selección */}
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-3">
        {haySeleccion ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-900">
              {seleccionados.length} seleccionados
            </span>
            <button
              type="button"
              onClick={() => void aplicar(seleccionados, "guardar", true)}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Aprobar
            </button>
            <button
              type="button"
              onClick={() => void aplicar(seleccionados, "archivar", true)}
              className="rounded-md bg-slate-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
            >
              Archivar
            </button>
            <button
              type="button"
              onClick={() => setSeleccion(new Set())}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <span className="text-xs text-slate-500">
              En lote solo cambia el estado; para editar campos usá la fila.
            </span>
          </div>
        ) : (
          <input
            value={filtro}
            onChange={(e) => {
              setFiltro(e.target.value);
              setPagina(0);
            }}
            aria-label="Buscar"
            placeholder="Buscar"
            className="h-9 w-72 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        )}

        <p className="text-xs text-slate-500">
          <kbd className="rounded border border-slate-300 px-1">Enter</kbd> aprueba ·{" "}
          <kbd className="rounded border border-slate-300 px-1">⇧Enter</kbd> guarda ·{" "}
          <kbd className="rounded border border-slate-300 px-1">Ctrl</kbd>+
          <kbd className="rounded border border-slate-300 px-1">↑↓</kbd> filas ·{" "}
          <kbd className="rounded border border-slate-300 px-1">Ctrl</kbd>+
          <kbd className="rounded border border-slate-300 px-1">⌫</kbd> archiva
        </p>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

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

      <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[104rem] text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-500">
              <th className="w-9 px-2 py-1.5">
                <input
                  type="checkbox"
                  aria-label="Seleccionar todos"
                  checked={todosMarcados}
                  onChange={alternarTodos}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-300"
                />
              </th>
              <Th columna="fecha" orden={orden} onOrdenar={ordenarPor} ancho="w-24">
                Fecha
              </Th>
              <Th columna="texto" orden={orden} onOrdenar={ordenarPor}>
                Texto de referencia
              </Th>
              <Th columna="proveedor" orden={orden} onOrdenar={ordenarPor}>
                Proveedor
              </Th>
              <Th columna="factura" orden={orden} onOrdenar={ordenarPor} ancho="w-28">
                Factura
              </Th>
              <Th
                columna="monto"
                orden={orden}
                onOrdenar={ordenarPor}
                ancho="w-28"
                alineado="derecha"
              >
                Monto
              </Th>
              <Th columna="ceco" orden={orden} onOrdenar={ordenarPor} ancho="w-32">
                Centro de Costo
              </Th>
              <Th columna="asignacion" orden={orden} onOrdenar={ordenarPor} ancho="w-44">
                Orden Interna
              </Th>
              <Th columna="fase" orden={orden} onOrdenar={ordenarPor} ancho="w-40">
                Fase
              </Th>
              <Th columna="motivo" orden={orden} onOrdenar={ordenarPor} ancho="w-40">
                Motivo
              </Th>
              <Th columna="detalle" orden={orden} onOrdenar={ordenarPor} ancho="w-40">
                Detalle
              </Th>
              <Th columna="nota" orden={orden} onOrdenar={ordenarPor} ancho="w-44">
                Nota
              </Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {enPagina.map((g, i) => {
              const b = borradorDe(g);
              const bloqueada = enProceso.has(g.id);
              const marcada = seleccion.has(g.id);

              return (
                <tr
                  key={g.id}
                  className={
                    (bloqueada ? "opacity-50 " : "") +
                    (marcada ? "bg-sky-50" : "hover:bg-slate-50")
                  }
                >
                  <td className="px-2 py-1.5 align-middle">
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar gasto del ${g.fecha_documento}`}
                      checked={marcada}
                      onChange={() => alternar(g.id)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-300"
                    />
                  </td>

                  <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-slate-600">
                    {g.fecha_documento}
                  </td>

                  <td className="max-w-[20rem] px-2 py-1.5">
                    <p className="truncate text-slate-900">{g.texto_referencia ?? "—"}</p>
                    {g.grupo_clase_coste && (
                      <p className="truncate text-[10px] text-slate-400">
                        {g.grupo_clase_coste}
                      </p>
                    )}
                  </td>

                  <td className="max-w-[12rem] truncate px-2 py-1.5 text-slate-600">
                    {g.proveedor ?? g.proveedor_codigo ?? "—"}
                  </td>

                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[11px] text-slate-600">
                    {g.factura ?? "—"}
                  </td>

                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-slate-900">
                    {moneda.format(g.monto_real)}
                  </td>

                  <td className="whitespace-nowrap px-2 py-1.5 text-slate-500">
                    {g.ceco_codigo ?? g.ceco_codigo_raw ?? "—"}
                  </td>

                  <td className="px-2 py-1.5">
                    <input
                      ref={(el) => {
                        primeraCeldaRef.current[i] = el;
                      }}
                      list="opciones-asignacion"
                      autoComplete="off"
                      disabled={bloqueada}
                      value={b.asignacion}
                      aria-label="Orden Interna"
                      onChange={(e) => editar(g.id, "asignacion", e.target.value)}
                      onKeyDown={(e) => manejarTecla(e, g, i)}
                      className={CELDA}
                    />
                    {g.hunting_zone && (
                      <p className="mt-0.5 truncate text-[10px] text-emerald-700">
                        {g.hunting_zone}
                      </p>
                    )}
                  </td>

                  <td className="px-2 py-1.5">
                    <CampoSugerido
                      idLista="sugerencias-fase"
                      disabled={bloqueada}
                      value={b.fase}
                      aria-label="Fase"
                      onChange={(e) => editar(g.id, "fase", e.target.value)}
                      onKeyDown={(e) => manejarTecla(e, g, i)}
                      className={CELDA}
                    />
                  </td>

                  <td className="px-2 py-1.5">
                    <CampoSugerido
                      idLista="sugerencias-motivo"
                      disabled={bloqueada}
                      value={b.motivo}
                      aria-label="Motivo"
                      onChange={(e) => editar(g.id, "motivo", e.target.value)}
                      onKeyDown={(e) => manejarTecla(e, g, i)}
                      className={CELDA}
                    />
                  </td>

                  <td className="px-2 py-1.5">
                    <CampoSugerido
                      idLista="sugerencias-detalle"
                      disabled={bloqueada}
                      value={b.detalle}
                      aria-label="Detalle"
                      onChange={(e) => editar(g.id, "detalle", e.target.value)}
                      onKeyDown={(e) => manejarTecla(e, g, i)}
                      className={CELDA}
                    />
                  </td>

                  <td className="px-2 py-1.5">
                    <input
                      disabled={bloqueada}
                      value={b.nota}
                      aria-label="Nota"
                      onChange={(e) => editar(g.id, "nota", e.target.value)}
                      onKeyDown={(e) => manejarTecla(e, g, i)}
                      className={CELDA}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Paginación debajo de la tabla */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2">
          <label htmlFor="por-pagina" className="text-xs text-slate-500">
            Filas por página
          </label>
          <select
            id="por-pagina"
            value={porPagina}
            onChange={(e) => {
              setPorPagina(Number(e.target.value));
              setPagina(0);
            }}
            className="h-8 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            {POR_PAGINA.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500">
            {visibles.length} de {totalPendientes} · {moneda.format(montoVisible)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            Página {paginaActual + 1} de {totalPaginas}
          </span>
          <button
            type="button"
            disabled={paginaActual === 0}
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
            className="rounded-md border border-slate-300 bg-white px-3 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={paginaActual >= totalPaginas - 1}
            onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
            className="rounded-md border border-slate-300 bg-white px-3 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      </div>

      {visibles.length === 0 && (
        <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {filtro
            ? "Ningún gasto coincide con la búsqueda."
            : "Lote resuelto. Recargá para traer los siguientes pendientes."}
        </p>
      )}
    </div>
  );
}
