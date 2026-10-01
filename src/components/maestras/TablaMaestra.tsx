"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Mail, Plus, Save } from "lucide-react";

import { useAvisos } from "@/components/ui/Avisos";
import { Button } from "@/components/ui/Button";
import { CONTROL_CELDA, CONTROL_COMPACTO } from "@/components/ui/estilos";
import { Toggle } from "@/components/ui/Toggle";
import type { AccesoMiembro } from "@/types";

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
  /** El rol no puede editar esta maestra: se muestra sin controles ni alta. */
  soloLectura?: boolean;
  /**
   * Solo Equipo: estado de la cuenta de Supabase Auth de cada fila (por id).
   * Agrega la columna "Acceso" con invitar / reenviar / copiar enlace.
   */
  accesos?: Record<string, AccesoMiembro>;
}

const ETIQUETA_ACCESO: Record<AccesoMiembro["estado"], { texto: string; clase: string }> = {
  activo: { texto: "Activo", clase: "bg-[rgba(30,138,138,0.12)] text-[var(--ok)]" },
  invitado: { texto: "Invitación pendiente", clase: "bg-amber-100 text-amber-800" },
  sin_cuenta: { texto: "Sin cuenta", clase: "bg-[var(--line-soft)] text-[var(--muted)]" },
};

function fechaCorta(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("es-VE", { dateStyle: "medium" }) : "";
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

export function TablaMaestra({
  entidad,
  campos,
  filas,
  etiquetaAlta,
  soloLectura = false,
  accesos,
}: Props) {
  const router = useRouter();

  const [edicion, setEdicion] = useState<Record<string, FilaMaestra>>({});
  const [nueva, setNueva] = useState<Record<string, string | boolean> | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [invitando, setInvitando] = useState<string | null>(null);
  const avisos = useAvisos();

  // El servidor ya ordena cada entidad con criterio (codigo_oi, orden_display,
  // fy desc), así que `orden` arranca en null = "como vino" y sólo se ordena
  // cuando el usuario toca un encabezado.
  const [filtro, setFiltro] = useState("");
  const [soloModificadas, setSoloModificadas] = useState(false);
  const [orden, setOrden] = useState<{ clave: string; asc: boolean } | null>(null);
  const [porPagina, setPorPagina] = useState<number>(50);
  const [pagina, setPagina] = useState(0);

  const editables = campos.filter((c) => !c.soloLectura && !soloLectura);
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

  /** Guarda una fila. `enLote`: sin aviso de éxito ni refresh (los hace guardarTodas). */
  async function guardar(id: string, enLote = false): Promise<boolean> {
    const cambios = edicion[id];
    if (!cambios) return true;

    const fila = filas.find((f) => f.id === id);
    const faltan = faltantes({ ...fila, ...cambios });
    if (faltan.length > 0) {
      avisos.error(`Completa: ${faltan.map((f) => f.etiqueta).join(", ")}`);
      return false;
    }

    setGuardando(id);

    try {
      const res = await fetch(`/api/maestras/${entidad}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cambios),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        avisos.error(json.error ?? "No se pudo guardar.");
        return false;
      }
      setEdicion((prev) => {
        const copia = { ...prev };
        delete copia[id];
        return copia;
      });
      if (!enLote) {
        avisos.exito("Cambios guardados.");
        router.refresh();
      }
      return true;
    } catch {
      avisos.error("No se pudo conectar con el servidor.");
      return false;
    } finally {
      setGuardando(null);
    }
  }

  /** Guarda todas las filas modificadas, una por una; se detiene en la primera que falla. */
  async function guardarTodas() {
    let guardadas = 0;
    for (const id of sucias) {
      if (!(await guardar(id, true))) break;
      guardadas += 1;
    }
    if (guardadas > 0) {
      avisos.exito(guardadas === 1 ? "1 fila guardada." : `${guardadas} filas guardadas.`);
      router.refresh();
    }
  }

  async function invitar(id: string, soloEnlace: boolean) {
    setInvitando(id);
    try {
      const res = await fetch("/api/equipo/invitar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, soloEnlace }),
      });
      const json = (await res.json()) as { enlace?: string | null; error?: string };
      if (!res.ok) {
        avisos.error(json.error ?? "No se pudo invitar.");
        return;
      }
      if (soloEnlace && json.enlace) {
        try {
          await navigator.clipboard.writeText(json.enlace);
          avisos.exito("Enlace copiado. Envíalo por el medio que prefieras: vence en 24 horas.");
        } catch {
          avisos.error("No se pudo copiar al portapapeles.");
        }
      } else {
        avisos.exito("Invitación enviada por correo.");
      }
      router.refresh();
    } catch {
      avisos.error("No se pudo conectar con el servidor.");
    } finally {
      setInvitando(null);
    }
  }

  async function crear() {
    if (!nueva) return;

    const faltan = faltantes(nueva);
    if (faltan.length > 0) {
      avisos.error(`Completa: ${faltan.map((f) => f.etiqueta).join(", ")}`);
      return;
    }

    setGuardando("nueva");

    try {
      const res = await fetch(`/api/maestras/${entidad}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nueva),
      });
      const json = (await res.json()) as { error?: string; invitacion?: string | null };
      if (!res.ok) {
        avisos.error(json.error ?? "No se pudo crear.");
        return;
      }
      setNueva(null);
      if (json.invitacion && json.invitacion.includes("falló")) {
        avisos.error(json.invitacion);
      } else {
        avisos.exito(json.invitacion ? `Registro creado. ${json.invitacion}` : "Registro creado.");
      }
      // La fila nueva cae donde la ponga el orden del servidor; la página 0 es
      // el lugar menos sorprendente para quedar parado.
      setPagina(0);
      router.refresh();
    } catch {
      avisos.error("No se pudo conectar con el servidor.");
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

  const conAcceso = accesos !== undefined;
  const columnas = campos.length + 1 + (conAcceso ? 1 : 0);

  function celdaAcceso(fila: FilaMaestra) {
    const acceso = accesos?.[fila.id];
    if (!fila.rol || !fila.activo) {
      return (
        <span className="text-[var(--muted)]">
          {fila.activo ? "Sin rol: no entra a la app" : "Inactivo"}
        </span>
      );
    }
    if (!acceso) return <span className="text-[var(--muted)]">—</span>;

    const etiqueta = ETIQUETA_ACCESO[acceso.estado];
    const ocupado = invitando === fila.id;
    return (
      <div className="flex flex-col items-start gap-1">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${etiqueta.clase}`}>
          {etiqueta.texto}
        </span>
        {acceso.estado === "activo" && acceso.ultimoIngreso && (
          <span className="text-[10px] text-[var(--muted)]">
            Último ingreso: {fechaCorta(acceso.ultimoIngreso)}
          </span>
        )}
        {acceso.estado === "invitado" && acceso.invitadoEl && (
          <span className="text-[10px] text-[var(--muted)]">
            Invitado el {fechaCorta(acceso.invitadoEl)}
          </span>
        )}
        {acceso.estado !== "activo" && !soloLectura && (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <button
              type="button"
              disabled={ocupado || Boolean(edicion[fila.id])}
              title={edicion[fila.id] ? "Guarda los cambios de la fila primero" : undefined}
              onClick={() => void invitar(fila.id, false)}
              className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-[var(--blue)] hover:underline disabled:opacity-40"
            >
              <Mail className="size-3" aria-hidden />
              {acceso.estado === "invitado" ? "Reenviar" : "Invitar"}
            </button>
            <button
              type="button"
              disabled={ocupado || Boolean(edicion[fila.id])}
              onClick={() => void invitar(fila.id, true)}
              className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-[var(--ink-soft)] hover:underline disabled:opacity-40"
            >
              <Copy className="size-3" aria-hidden />
              Copiar enlace
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Acciones arriba: con tablas largas, abajo obligaban a bajar hasta el final. */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {!soloLectura && (
          <Button
            type="button"
            onClick={abrirAlta}
            disabled={nueva !== null}
            className="gap-1.5 px-3 py-1.5"
          >
            <Plus className="size-4" aria-hidden />
            {etiquetaAlta}
          </Button>
        )}
        {!soloLectura && sucias.length > 0 && (
          <Button
            type="button"
            variante="secundario"
            cargando={guardando !== null}
            onClick={() => void guardarTodas()}
            className="px-3 py-1.5"
          >
            {guardando === null && <Save className="size-4" aria-hidden />}
            Guardar {sucias.length === 1 ? "1 cambio" : `${sucias.length} cambios`}
          </Button>
        )}
        <input
          type="search"
          value={filtro}
          onChange={(e) => {
            setFiltro(e.target.value);
            setPagina(0);
          }}
          placeholder="Buscar…"
          aria-label="Buscar en la tabla"
          className={`w-full sm:w-64 ${CONTROL_COMPACTO}`}
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
        <table className="ui-table text-xs" style={{ minWidth: `${columnas * 9}rem` }}>
          <thead>
            <tr>
              {campos.map((c) => (
                <Th key={c.clave} campo={c} orden={orden} onOrdenar={ordenarPor} />
              ))}
              {conAcceso && <th className="min-w-[15rem]">Acceso</th>}
              {/* w-px: la columna se ajusta a su contenido ("Guardar" solo aparece
                  en filas editadas) en vez de reservar espacio vacío. */}
              <th className="w-px">
                <span className="sr-only">Acciones</span>
              </th>
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
                {conAcceso && (
                  <td className="whitespace-normal text-[11px] text-[var(--muted)]">
                    Con rol, se le envía la invitación al crear.
                  </td>
                )}
                <td className="w-px whitespace-nowrap">
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
                        {c.soloLectura || soloLectura ? (
                          <span className="text-[var(--muted)]">
                            {valor === null || valor === "" ? "—" : textoDeCampo(c, valor)}
                          </span>
                        ) : (
                          campoEditor(c, valor ?? null, (v) => editar(fila.id, c.clave, v))
                        )}
                      </td>
                    );
                  })}
                  {conAcceso && <td className="whitespace-normal text-xs">{celdaAcceso(fila)}</td>}
                  <td className="w-px whitespace-nowrap">
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
                <td colSpan={columnas} className="text-center text-[var(--muted)]">
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

    </div>
  );
}
