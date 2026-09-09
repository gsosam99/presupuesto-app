"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { CONTROL_CELDA, CONTROL_COMPACTO } from "@/components/ui/estilos";
import { Toggle } from "@/components/ui/Toggle";

export type TipoCampo = "texto" | "numero" | "fecha" | "booleano" | "select";

export interface CampoMaestra {
  clave: string;
  etiqueta: string;
  tipo: TipoCampo;
  /** Solo para tipo "select". */
  opciones?: Array<{ valor: string; etiqueta: string }>;
  obligatorio?: boolean;
  ancho?: string;
  /** No editable: se muestra pero no se envía. */
  soloLectura?: boolean;
}

export type FilaMaestra = Record<string, string | number | boolean | null> & {
  id: string;
};

interface Props {
  entidad: string;
  campos: CampoMaestra[];
  filas: FilaMaestra[];
  /** Texto del botón de alta, p. ej. "Nueva orden interna". */
  etiquetaAlta: string;
}

const CELDA = CONTROL_CELDA;

const POR_PAGINA = [25, 50, 100, 250] as const;

function valorInicial(campo: CampoMaestra): string | boolean {
  if (campo.tipo === "booleano") return true;
  return "";
}

/** Campos obligatorios que faltan por completar (los booleanos no aplican: siempre tienen valor). */
function campoVacio(valor: string | number | boolean | null | undefined): boolean {
  return valor === null || valor === undefined || valor === "";
}

/**
 * Texto con el que se busca y se ordena una celda. Para un `select` es la
 * ETIQUETA de la opción, no el uuid: si no, buscar "Método" no encontraría la
 * orden interna de esa Hunting Zone y ordenar por esa columna daría un orden
 * aleatorio a ojos del usuario.
 */
function textoDeCampo(
  campo: CampoMaestra,
  valor: string | number | boolean | null | undefined,
): string {
  if (valor === null || valor === undefined) return "";
  if (campo.tipo === "booleano") return valor ? "sí" : "no";
  if (campo.tipo === "select") {
    return campo.opciones?.find((o) => o.valor === String(valor))?.etiqueta ?? String(valor);
  }
  return String(valor);
}

function Th({
  campo,
  orden,
  onOrdenar,
}: {
  campo: CampoMaestra;
  orden: { clave: string; asc: boolean } | null;
  onOrdenar: (clave: string) => void;
}) {
  const activa = orden?.clave === campo.clave;
  return (
    <th className={campo.ancho}>
      <button
        type="button"
        onClick={() => onOrdenar(campo.clave)}
        className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-[var(--ink)]"
      >
        {campo.etiqueta}
        {campo.obligatorio && <span className="text-[var(--bad)]">*</span>}
        <span className={activa ? "text-[var(--ink)]" : "text-[var(--line)]"}>
          {activa && !orden.asc ? "▾" : "▴"}
        </span>
      </button>
    </th>
  );
}

export function TablaMaestra({ entidad, campos, filas, etiquetaAlta }: Props) {
  const router = useRouter();

  const [edicion, setEdicion] = useState<Record<string, FilaMaestra>>({});
  const [nueva, setNueva] = useState<Record<string, string | boolean> | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // El servidor ya ordena cada entidad con criterio (codigo_oi, orden_display,
  // fy desc), así que `orden` arranca en null = "como vino" y sólo se ordena
  // cuando el usuario toca un encabezado.
  const [filtro, setFiltro] = useState("");
  const [soloModificadas, setSoloModificadas] = useState(false);
  const [orden, setOrden] = useState<{ clave: string; asc: boolean } | null>(null);
  const [porPagina, setPorPagina] = useState<number>(50);
  const [pagina, setPagina] = useState(0);

  const editables = campos.filter((c) => !c.soloLectura);
  const sucias = Object.keys(edicion);

  const visibles = useMemo(() => {
    const texto = filtro.trim().toLowerCase();

    const filtrados = filas.filter((f) => {
      if (soloModificadas && !edicion[f.id]) return false;
      if (texto === "") return true;
      return campos.some((c) => textoDeCampo(c, f[c.clave]).toLowerCase().includes(texto));
    });

    if (orden === null) return filtrados;

    const campo = campos.find((c) => c.clave === orden.clave);
    if (!campo) return filtrados;

    const signo = orden.asc ? 1 : -1;
    return [...filtrados].sort((a, b) => {
      const va = a[campo.clave];
      const vb = b[campo.clave];
      if (campo.tipo === "numero") return (Number(va ?? 0) - Number(vb ?? 0)) * signo;
      if (campo.tipo === "booleano") {
        return (Number(Boolean(va)) - Number(Boolean(vb))) * signo;
      }
      return textoDeCampo(campo, va).localeCompare(textoDeCampo(campo, vb), "es") * signo;
    });
  }, [filas, campos, filtro, soloModificadas, edicion, orden]);

  // El clamp es lo que mantiene la tabla sana cuando router.refresh() achica
  // `filas` estando en la última página.
  const totalPaginas = Math.max(1, Math.ceil(visibles.length / porPagina));
  const paginaActual = Math.min(pagina, totalPaginas - 1);
  const enPagina = visibles.slice(
    paginaActual * porPagina,
    paginaActual * porPagina + porPagina,
  );

  function ordenarPor(clave: string) {
    setOrden((o) => (o?.clave === clave ? { clave, asc: !o.asc } : { clave, asc: true }));
    setPagina(0);
  }

  /** Campos obligatorios que faltarían si se guardara `datos` tal cual. */
  function faltantes(
    datos: Record<string, string | number | boolean | null | undefined>,
  ): CampoMaestra[] {
    return editables.filter(
      (c) => c.obligatorio && c.tipo !== "booleano" && campoVacio(datos[c.clave]),
    );
  }

  function editar(id: string, clave: string, valor: string | boolean) {
    setEdicion((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { id }), id, [clave]: valor },
    }));
  }

  async function guardar(id: string) {
    const cambios = edicion[id];
    if (!cambios) return;

    const fila = filas.find((f) => f.id === id);
    const faltan = faltantes({ ...fila, ...cambios });
    if (faltan.length > 0) {
      setError(`Completa: ${faltan.map((f) => f.etiqueta).join(", ")}`);
      return;
    }

    setGuardando(id);
    setError(null);
    setOk(null);

    try {
      const res = await fetch(`/api/maestras/${entidad}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cambios),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "No se pudo guardar.");
        return;
      }
      setEdicion((prev) => {
        const copia = { ...prev };
        delete copia[id];
        return copia;
      });
      setOk("Cambios guardados.");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setGuardando(null);
    }
  }

  async function crear() {
    if (!nueva) return;

    const faltan = faltantes(nueva);
    if (faltan.length > 0) {
      setError(`Completa: ${faltan.map((f) => f.etiqueta).join(", ")}`);
      return;
    }

    setGuardando("nueva");
    setError(null);
    setOk(null);

    try {
      const res = await fetch(`/api/maestras/${entidad}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nueva),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "No se pudo crear.");
        return;
      }
      setNueva(null);
      setOk("Registro creado.");
      // La fila nueva cae donde la ponga el orden del servidor; la página 0 es
      // el lugar menos sorprendente para quedar parado.
      setPagina(0);
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setGuardando(null);
    }
  }

  function abrirAlta() {
    // Un filtro activo escondería el borrador apenas se escriba en él.
    setFiltro("");
    setSoloModificadas(false);
    setPagina(0);
    setNueva(
      Object.fromEntries(editables.map((c) => [c.clave, valorInicial(c)])) as Record<
        string,
        string | boolean
      >,
    );
  }

  function campoEditor(
    campo: CampoMaestra,
    valor: string | number | boolean | null,
    onChange: (v: string | boolean) => void,
    deshabilitado = false,
  ) {
    if (campo.tipo === "booleano") {
      return (
        <Toggle
          checked={Boolean(valor)}
          etiqueta={campo.etiqueta}
          disabled={deshabilitado}
          onChange={onChange}
        />
      );
    }

    if (campo.tipo === "select") {
      return (
        <select
          aria-label={campo.etiqueta}
          value={valor === null || valor === undefined ? "" : String(valor)}
          disabled={deshabilitado}
          required={campo.obligatorio}
          onChange={(e) => onChange(e.target.value)}
          className={CELDA}
        >
          <option value="">—</option>
          {(campo.opciones ?? []).map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        type={campo.tipo === "fecha" ? "date" : campo.tipo === "numero" ? "number" : "text"}
        aria-label={campo.etiqueta}
        value={valor === null || valor === undefined ? "" : String(valor)}
        disabled={deshabilitado}
        required={campo.obligatorio}
        onChange={(e) => onChange(e.target.value)}
        className={CELDA}
      />
    );
  }

  return (
    <div>
      {error && (
        <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-[var(--bad)]">
          {error}
        </p>
      )}
      {ok && (
        <p className="mb-3 rounded-md bg-[rgba(30,138,138,0.1)] px-3 py-2 text-sm text-[var(--ok)]">
          {ok}
        </p>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={filtro}
          onChange={(e) => {
            setFiltro(e.target.value);
            setPagina(0);
          }}
          placeholder="Buscar…"
          aria-label="Buscar en la tabla"
          className={`w-64 ${CONTROL_COMPACTO}`}
        />
        <span className="text-xs text-[var(--muted)]">
          {visibles.length} de {filas.length}
        </span>

        {/* Sin este atajo, filtrar o cambiar de página esconde el botón
            "Guardar" de una fila editada sin forma de volver a encontrarla. */}
        {sucias.length > 0 && (
          <label className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
            <input
              type="checkbox"
              checked={soloModificadas}
              onChange={(e) => {
                setSoloModificadas(e.target.checked);
                setPagina(0);
              }}
              className="h-3.5 w-3.5 rounded border-slate-300"
            />
            {sucias.length} sin guardar
          </label>
        )}
      </div>

      <div className="ui-card overflow-x-auto">
        <table className="ui-table text-xs" style={{ minWidth: `${campos.length * 9}rem` }}>
          <thead>
            <tr>
              {campos.map((c) => (
                <Th key={c.clave} campo={c} orden={orden} onOrdenar={ordenarPor} />
              ))}
              <th className="w-24" />
            </tr>
          </thead>

          {/* La fila borrador vive en su propio tbody para quedar fijada arriba
              sin importar en qué página esté el usuario. */}
          {nueva && (
            <tbody>
              <tr className="bg-[rgba(46,117,182,0.06)]">
                {campos.map((c) => (
                  <td key={c.clave}>
                    {c.soloLectura
                      ? "—"
                      : campoEditor(c, nueva[c.clave] ?? valorInicial(c), (v) =>
                          setNueva((prev) => ({ ...prev, [c.clave]: v })),
                        )}
                  </td>
                ))}
                <td className="whitespace-nowrap">
                  <button
                    type="button"
                    disabled={guardando === "nueva"}
                    onClick={() => void crear()}
                    className="mr-2 font-semibold text-[var(--ok)] hover:underline disabled:opacity-50"
                  >
                    Crear
                  </button>
                  <button
                    type="button"
                    onClick={() => setNueva(null)}
                    className="text-[var(--muted)] hover:underline"
                  >
                    Cancelar
                  </button>
                </td>
              </tr>
            </tbody>
          )}

          <tbody>
            {enPagina.map((fila) => {
              const cambios = edicion[fila.id];
              const modificada = Boolean(cambios);

              return (
                <tr key={fila.id} className={modificada ? "bg-amber-50" : undefined}>
                  {campos.map((c) => {
                    const valor = cambios?.[c.clave] ?? fila[c.clave];
                    return (
                      <td key={c.clave}>
                        {c.soloLectura ? (
                          <span className="text-[var(--muted)]">
                            {valor === null || valor === "" ? "—" : String(valor)}
                          </span>
                        ) : (
                          campoEditor(c, valor ?? null, (v) => editar(fila.id, c.clave, v))
                        )}
                      </td>
                    );
                  })}
                  <td className="whitespace-nowrap">
                    {modificada && (
                      <button
                        type="button"
                        disabled={guardando === fila.id}
                        onClick={() => void guardar(fila.id)}
                        className="font-semibold text-[var(--blue)] hover:underline disabled:opacity-50"
                      >
                        {guardando === fila.id ? "Guardando…" : "Guardar"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}

            {enPagina.length === 0 && (
              <tr>
                <td colSpan={campos.length + 1} className="text-center text-[var(--muted)]">
                  {filtro ? "Ningún registro coincide con la búsqueda." : "No hay registros."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPaginas > 1 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2">
            <label htmlFor={`por-pagina-${entidad}`} className="text-xs text-[var(--muted)]">
              Filas por página
            </label>
            <select
              id={`por-pagina-${entidad}`}
              value={porPagina}
              onChange={(e) => {
                setPorPagina(Number(e.target.value));
                setPagina(0);
              }}
              className={`w-20 ${CONTROL_COMPACTO}`}
            >
              {POR_PAGINA.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--muted)]">
              Página {paginaActual + 1} de {totalPaginas}
            </span>
            <button
              type="button"
              disabled={paginaActual === 0}
              onClick={() => setPagina((p) => Math.max(0, p - 1))}
              className="rounded-md border border-[var(--line)] bg-white px-3 py-1 text-[var(--ink)] hover:bg-[var(--line-soft)] disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={paginaActual >= totalPaginas - 1}
              onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
              className="rounded-md border border-[var(--line)] bg-white px-3 py-1 text-[var(--ink)] hover:bg-[var(--line-soft)] disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {!nueva && (
        <Button type="button" variante="secundario" className="mt-3" onClick={abrirAlta}>
          {etiquetaAlta}
        </Button>
      )}
    </div>
  );
}
