"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { CONTROL_CELDA } from "@/components/ui/estilos";

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

function valorInicial(campo: CampoMaestra): string | boolean {
  if (campo.tipo === "booleano") return true;
  return "";
}

/** Campos obligatorios que faltan por completar (los booleanos no aplican: siempre tienen valor). */
function campoVacio(valor: string | number | boolean | null | undefined): boolean {
  return valor === null || valor === undefined || valor === "";
}

export function TablaMaestra({ entidad, campos, filas, etiquetaAlta }: Props) {
  const router = useRouter();

  const [edicion, setEdicion] = useState<Record<string, FilaMaestra>>({});
  const [nueva, setNueva] = useState<Record<string, string | boolean> | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const editables = campos.filter((c) => !c.soloLectura);

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
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setGuardando(null);
    }
  }

  function campoEditor(
    campo: CampoMaestra,
    valor: string | number | boolean | null,
    onChange: (v: string | boolean) => void,
    deshabilitado = false,
  ) {
    if (campo.tipo === "booleano") {
      return (
        <input
          type="checkbox"
          aria-label={campo.etiqueta}
          checked={Boolean(valor)}
          disabled={deshabilitado}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
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

      <div className="ui-card overflow-x-auto">
        <table className="ui-table text-xs" style={{ minWidth: `${campos.length * 9}rem` }}>
          <thead>
            <tr>
              {campos.map((c) => (
                <th key={c.clave} className={c.ancho}>
                  {c.etiqueta}
                  {c.obligatorio && <span className="text-[var(--bad)]"> *</span>}
                </th>
              ))}
              <th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {nueva && (
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
            )}

            {filas.map((fila) => {
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
          </tbody>
        </table>
      </div>

      {!nueva && (
        <Button
          type="button"
          variante="secundario"
          className="mt-3"
          onClick={() =>
            setNueva(
              Object.fromEntries(editables.map((c) => [c.clave, valorInicial(c)])) as Record<
                string,
                string | boolean
              >,
            )
          }
        >
          {etiquetaAlta}
        </Button>
      )}
    </div>
  );
}
