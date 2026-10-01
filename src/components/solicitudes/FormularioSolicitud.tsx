"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { avisarNavegacion } from "@/components/nav/BarraNavegacion";
import { Button } from "@/components/ui/Button";
import {
  AYUDA,
  CONTROL,
  CONTROL_COMPACTO,
  CONTROL_TEXTAREA,
  ETIQUETA,
} from "@/components/ui/estilos";
import { etiquetaTrimestre, MESES_FY, mesesDeTrimestre, nombreMes } from "@/lib/fiscal";
import type { TipoSolicitud } from "@/types";

export interface OpcionOi {
  id: string;
  codigo: string;
  nombre: string | null;
  /** Rango de vigencia legible, o null si la orden está abierta. */
  vigencia: string | null;
}

interface Linea {
  /** Solo para el `key` de React: no viaja a la API. */
  id: string;
  mes: number;
  monto: string;
  cuenta_contable: string;
  descripcion_cuenta: string;
  tipo_gasto: string;
  detalle_gasto: string;
  responsable: string;
}

interface Props {
  ordenesInternas: OpcionOi[];
  fy: number;
  tipoInicial: TipoSolicitud;
  oiInicial?: string;
  /**
   * Unidad por Centro de Costo (Hunting Zones sin OI). Si viene, la solicitud
   * se imputa al CeCo y no se pide Orden Interna.
   */
  ceco?: { id: string; etiqueta: string };
  trimestreInicial?: number;
  montoInicial?: number;
  /** Mes con el que arranca la primera línea (ahorro, reclasificación). */
  mesInicial?: number;
}

/** Tipos de solicitud con la explicación que ve el usuario al elegir. */
const TIPOS: ReadonlyArray<{ valor: TipoSolicitud; etiqueta: string; ayuda: string }> = [
  {
    valor: "extra_plan",
    etiqueta: "Extra plan",
    ayuda: "Pedir fondos adicionales. Aprobado, suma como suplemento.",
  },
  {
    valor: "reclasificacion",
    etiqueta: "Reclasificación",
    ayuda: "Mover fondos de esta orden a otra: devolución en el origen, suplemento en el destino.",
  },
  {
    valor: "provision",
    etiqueta: "Provisión",
    ayuda:
      "El servicio ya se recibió pero falta la factura: reserva ese monto para que no se retire al cierre del trimestre.",
  },
  {
    valor: "ahorro",
    etiqueta: "Ahorro",
    ayuda: "Fondos que no se usarán: se devuelven a finanzas antes del cierre.",
  },
];

/** Tipos que se piden por líneas de mes + monto. */
const CON_LINEAS: ReadonlySet<TipoSolicitud> = new Set(["extra_plan", "reclasificacion", "ahorro"]);

function lineaVacia(mes: number): Linea {
  return {
    id: crypto.randomUUID(),
    mes,
    monto: "",
    cuenta_contable: "",
    descripcion_cuenta: "",
    tipo_gasto: "",
    detalle_gasto: "",
    responsable: "",
  };
}

export function FormularioSolicitud({
  ordenesInternas,
  fy,
  tipoInicial,
  oiInicial,
  ceco,
  trimestreInicial,
  montoInicial,
  mesInicial,
}: Props) {
  const router = useRouter();

  const [tipo, setTipo] = useState<TipoSolicitud>(tipoInicial);
  const [idOi, setIdOi] = useState(oiInicial ?? "");
  const [titulo, setTitulo] = useState("");
  const [justificacion, setJustificacion] = useState("");
  const [trimestre, setTrimestre] = useState(trimestreInicial ?? 1);
  const [monto, setMonto] = useState(montoInicial ? String(montoInicial) : "");
  const [idOiDestino, setIdOiDestino] = useState("");
  const mesDefecto = mesInicial && MESES_FY.includes(mesInicial) ? mesInicial : MESES_FY[0];
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia(mesDefecto)]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // El extra plan lleva el detalle contable que pide finanzas; reclasificación
  // y ahorro solo necesitan mes, monto y un detalle.
  const completa = tipo === "extra_plan";

  const total = useMemo(() => lineas.reduce((s, l) => s + (Number(l.monto) || 0), 0), [lineas]);

  function editarLinea(i: number, campo: keyof Linea, valor: string) {
    setLineas((prev) =>
      prev.map((l, j) =>
        j === i ? { ...l, [campo]: campo === "mes" ? Number(valor) : valor } : l,
      ),
    );
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    setError(null);

    const res = await fetch("/api/solicitudes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo,
        id_oi: ceco ? null : idOi || null,
        id_ceco: ceco?.id ?? null,
        id_oi_destino: tipo === "reclasificacion" ? idOiDestino || null : null,
        fy,
        trimestre: tipo === "provision" ? trimestre : null,
        titulo,
        justificacion,
        monto_solicitado: tipo === "provision" ? Number(monto) || null : null,
        lineas: CON_LINEAS.has(tipo)
          ? lineas
              .filter((l) => Number(l.monto) > 0)
              .map((l) => ({
                mes: l.mes,
                monto: Number(l.monto),
                cuenta_contable: l.cuenta_contable,
                descripcion_cuenta: l.descripcion_cuenta,
                tipo_gasto: l.tipo_gasto,
                detalle_gasto: l.detalle_gasto,
                responsable: l.responsable,
              }))
          : [],
      }),
    });

    const json = (await res.json()) as { id?: string; error?: string };
    setEnviando(false);

    if (!res.ok || !json.id) {
      setError(json.error ?? "No se pudo crear la solicitud.");
      return;
    }

    avisarNavegacion();
    router.push(`/solicitudes/${json.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="ui-card p-5">
      <fieldset>
        <legend className={ETIQUETA}>Tipo de solicitud</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {TIPOS.map((t) => (
            <label
              key={t.valor}
              className={
                "flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm " +
                (tipo === t.valor
                  ? "border-[var(--blue)] bg-[rgba(46,117,182,0.06)]"
                  : "border-[var(--line)] bg-white")
              }
            >
              <input
                type="radio"
                name="tipo"
                checked={tipo === t.valor}
                onChange={() => setTipo(t.valor)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                <span className="font-semibold text-[var(--ink)]">{t.etiqueta}</span>
                <span className="block text-xs text-[var(--muted)]">{t.ayuda}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {ceco ? (
          <div>
            <label htmlFor="id_ceco" className={ETIQUETA}>
              Centro de Costo
            </label>
            <input
              id="id_ceco"
              disabled
              value={ceco.etiqueta}
              className={`mt-1 ${CONTROL} disabled:bg-slate-100 disabled:text-slate-600`}
            />
          </div>
        ) : (
          <div>
            <label htmlFor="id_oi" className={ETIQUETA}>
              {tipo === "reclasificacion" ? "Orden Interna de origen *" : "Orden Interna *"}
            </label>
            <select
              id="id_oi"
              required
              value={idOi}
              onChange={(e) => setIdOi(e.target.value)}
              className={`mt-1 ${CONTROL}`}
            >
              <option value="">— elegir —</option>
              {ordenesInternas.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.codigo}
                  {o.nombre ? ` — ${o.nombre}` : ""}
                  {o.vigencia ? ` (${o.vigencia})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {tipo === "reclasificacion" && (
          <div>
            <label htmlFor="id_oi_destino" className={ETIQUETA}>
              Orden Interna de destino *
            </label>
            <select
              id="id_oi_destino"
              required
              value={idOiDestino}
              onChange={(e) => setIdOiDestino(e.target.value)}
              className={`mt-1 ${CONTROL}`}
            >
              <option value="">— elegir —</option>
              {ordenesInternas
                .filter((o) => o.id !== idOi)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.codigo}
                    {o.nombre ? ` — ${o.nombre}` : ""}
                    {o.vigencia ? ` (${o.vigencia})` : ""}
                  </option>
                ))}
            </select>
            <p className={AYUDA}>Recibe los fondos como suplemento en los meses indicados.</p>
          </div>
        )}

        <div>
          <label htmlFor="titulo" className={ETIQUETA}>
            Título *
          </label>
          <input
            id="titulo"
            required
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            className={`mt-1 ${CONTROL}`}
          />
        </div>
      </div>

      {tipo === "provision" && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="trimestre" className={ETIQUETA}>
              Trimestre que se provisiona *
            </label>
            <select
              id="trimestre"
              value={trimestre}
              onChange={(e) => setTrimestre(Number(e.target.value))}
              className={`mt-1 ${CONTROL}`}
            >
              {[1, 2, 3, 4].map((t) => (
                <option key={t} value={t}>
                  {etiquetaTrimestre(t)}
                </option>
              ))}
            </select>
            <p className={AYUDA}>
              El trimestre en curso o uno ya cerrado. Aprobada, al cierre ese monto no se retira:
              pasa al trimestre siguiente para pagar la factura pendiente.
            </p>
          </div>
          <div>
            <label htmlFor="monto" className={ETIQUETA}>
              Monto a provisionar (USD) *
            </label>
            <input
              id="monto"
              type="number"
              step="0.01"
              required
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              className={`mt-1 ${CONTROL}`}
            />
          </div>
        </div>
      )}

      {CON_LINEAS.has(tipo) && (
        <section className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="ui-section-title">
              {tipo === "extra_plan"
                ? "Líneas del extra plan"
                : tipo === "reclasificacion"
                  ? "Montos a reclasificar por mes"
                  : "Montos a devolver por mes"}
            </h2>
            <p className="text-sm text-[var(--muted)]">
              Total:{" "}
              <span className="font-bold tabular-nums text-[var(--ink)]">
                {total.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
              </span>
            </p>
          </div>

          <div className="mt-3 overflow-x-auto rounded-md border border-[var(--line)]">
            <table className={`ui-table text-xs ${completa ? "min-w-[60rem]" : "min-w-[32rem]"}`}>
              <thead>
                <tr>
                  <th className="w-28">Mes</th>
                  <th className="w-28">Monto</th>
                  {completa && <th>Tipo de gasto</th>}
                  <th>{completa ? "Detalle del gasto" : "Detalle"}</th>
                  {completa && <th className="w-32">N.º de cuenta</th>}
                  {completa && <th>Descripción de cuenta</th>}
                  {completa && <th className="w-36">Responsable</th>}
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {lineas.map((l, i) => (
                  <tr key={l.id}>
                    <td>
                      <select
                        value={l.mes}
                        aria-label="Mes"
                        onChange={(e) => editarLinea(i, "mes", e.target.value)}
                        className={CONTROL_COMPACTO}
                      >
                        {MESES_FY.map((m) => (
                          <option key={m} value={m}>
                            {nombreMes(m)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        value={l.monto}
                        aria-label="Monto"
                        onChange={(e) => editarLinea(i, "monto", e.target.value)}
                        className={CONTROL_COMPACTO}
                      />
                    </td>
                    {completa && (
                      <td>
                        <input
                          value={l.tipo_gasto}
                          aria-label="Tipo de gasto"
                          onChange={(e) => editarLinea(i, "tipo_gasto", e.target.value)}
                          className={CONTROL_COMPACTO}
                        />
                      </td>
                    )}
                    <td>
                      <input
                        value={l.detalle_gasto}
                        aria-label="Detalle del gasto"
                        onChange={(e) => editarLinea(i, "detalle_gasto", e.target.value)}
                        className={CONTROL_COMPACTO}
                      />
                    </td>
                    {completa && (
                      <>
                        <td>
                          <input
                            value={l.cuenta_contable}
                            aria-label="Número de cuenta"
                            onChange={(e) => editarLinea(i, "cuenta_contable", e.target.value)}
                            className={CONTROL_COMPACTO}
                          />
                        </td>
                        <td>
                          <input
                            value={l.descripcion_cuenta}
                            aria-label="Descripción de cuenta"
                            onChange={(e) => editarLinea(i, "descripcion_cuenta", e.target.value)}
                            className={CONTROL_COMPACTO}
                          />
                        </td>
                        <td>
                          <input
                            value={l.responsable}
                            aria-label="Responsable"
                            onChange={(e) => editarLinea(i, "responsable", e.target.value)}
                            className={CONTROL_COMPACTO}
                          />
                        </td>
                      </>
                    )}
                    <td>
                      {lineas.length > 1 && (
                        <button
                          type="button"
                          aria-label="Quitar línea"
                          onClick={() => setLineas((prev) => prev.filter((_, j) => j !== i))}
                          className="text-[var(--muted)] hover:text-[var(--bad)]"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button
            type="button"
            variante="secundario"
            className="mt-3"
            onClick={() => setLineas((prev) => [...prev, lineaVacia(mesDefecto)])}
          >
            Agregar línea
          </Button>

          <p className={AYUDA}>
            Los meses se agrupan solos en su trimestre fiscal (
            {mesesDeTrimestre(1).map(nombreMes).join("/")} = T1, y así).
          </p>
        </section>
      )}

      <div className="mt-5">
        <label htmlFor="justificacion" className={ETIQUETA}>
          Justificación
        </label>
        <textarea
          id="justificacion"
          rows={4}
          value={justificacion}
          onChange={(e) => setJustificacion(e.target.value)}
          className={CONTROL_TEXTAREA}
        />
        <p className={AYUDA}>Se incluye en el archivo que recibe finanzas.</p>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-[var(--bad)]">
          {error}
        </p>
      )}

      <div className="mt-5">
        <Button cargando={enviando} type="submit" disabled={enviando}>
          {enviando ? "Creando…" : "Crear borrador"}
        </Button>
      </div>
    </form>
  );
}
