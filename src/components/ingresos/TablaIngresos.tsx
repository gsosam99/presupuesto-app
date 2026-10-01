"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { useAvisos } from "@/components/ui/Avisos";
import { Button } from "@/components/ui/Button";
import { CONTROL_COMPACTO } from "@/components/ui/estilos";
import { BarraFiltros, CampoFiltro } from "@/components/ui/Filtros";
import { Modal } from "@/components/ui/Modal";
import { ModalConfirmacion } from "@/components/ui/ModalConfirmacion";
import { MESES_FY, nombreMes } from "@/lib/fiscal";
import { moneda } from "@/lib/format";

import {
  FormularioIngreso,
  type FilaIngreso,
  type OpcionHz,
  type SugerenciasIngreso,
} from "./FormularioIngreso";

export type { FilaIngreso };

interface Props {
  fy: number;
  filas: FilaIngreso[];
  huntingZones: OpcionHz[];
  sugerencias: SugerenciasIngreso;
  /** Mes preseleccionado al registrar uno nuevo. */
  mesInicial: number;
  /** El rol no puede editar ingresos: sin alta, edición ni borrado. */
  soloLectura?: boolean;
}

/** null = cerrado · "nuevo" = alta · FilaIngreso = corrección. */
type Formulario = null | "nuevo" | FilaIngreso;

/**
 * Módulo de ingresos completo: listado con filtros, alta y corrección en un
 * modal, y borrado con confirmación.
 */
export function TablaIngresos({
  fy,
  filas,
  huntingZones,
  sugerencias,
  mesInicial,
  soloLectura = false,
}: Props) {
  const router = useRouter();
  const avisos = useAvisos();

  const [formulario, setFormulario] = useState<Formulario>(null);
  const [aBorrar, setABorrar] = useState<FilaIngreso | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [filtroMes, setFiltroMes] = useState("");
  const [filtroHz, setFiltroHz] = useState("");

  const nombreHz = useMemo(
    () => new Map(huntingZones.map((h) => [h.id, h.nombre])),
    [huntingZones],
  );

  const visibles = useMemo(() => {
    const texto = filtro.trim().toLowerCase();
    return filas.filter((f) => {
      if (filtroMes && f.mes !== Number(filtroMes)) return false;
      if (filtroHz && f.id_hunting_zone !== filtroHz) return false;
      if (texto === "") return true;
      return [f.concepto, f.fase, f.motivo, f.detalle, f.nota, String(f.monto)]
        .filter((v): v is string => typeof v === "string")
        .some((v) => v.toLowerCase().includes(texto));
    });
  }, [filas, filtro, filtroMes, filtroHz]);

  const total = visibles.reduce((s, f) => s + f.monto, 0);
  const hayFiltros = filtro !== "" || filtroMes !== "" || filtroHz !== "";

  async function borrar(f: FilaIngreso) {
    setBorrando(true);
    try {
      const res = await fetch(`/api/ingresos?id=${encodeURIComponent(f.id)}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        avisos.error(json.error ?? "No se pudo eliminar el ingreso.");
        return;
      }
      setABorrar(null);
      avisos.exito(`Ingreso "${f.concepto}" eliminado.`);
      router.refresh();
    } catch {
      avisos.error("No se pudo conectar con el servidor.");
    } finally {
      setBorrando(false);
    }
  }

  return (
    <div>
      {formulario !== null && (
        <Modal
          titulo={formulario === "nuevo" ? "Registrar ingreso" : "Editar ingreso"}
          descripcion={
            formulario === "nuevo"
              ? "Lo que efectivamente cobró el proyecto. Se imputa directo a la Hunting Zone."
              : undefined
          }
          onCerrar={() => setFormulario(null)}
          ancho="lg"
        >
          <FormularioIngreso
            key={formulario === "nuevo" ? "nuevo" : formulario.id}
            fy={fy}
            huntingZones={huntingZones}
            sugerencias={sugerencias}
            mesInicial={mesInicial}
            inicial={formulario === "nuevo" ? undefined : formulario}
            onCancelar={() => setFormulario(null)}
            onGuardado={(mensaje) => {
              setFormulario(null);
              avisos.exito(mensaje);
            }}
          />
        </Modal>
      )}

      {aBorrar && (
        <ModalConfirmacion
          titulo="Eliminar ingreso"
          textoConfirmar="Eliminar"
          peligro
          procesando={borrando}
          onConfirmar={() => void borrar(aBorrar)}
          onCancelar={() => setABorrar(null)}
        >
          <p>
            <strong>{aBorrar.concepto}</strong> · {nombreMes(aBorrar.mes)} ·{" "}
            {moneda.format(aBorrar.monto)}
          </p>
          <p className="mt-2">El ingreso se elimina y no se puede recuperar.</p>
        </ModalConfirmacion>
      )}

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <BarraFiltros className="flex-1">
          <CampoFiltro etiqueta="Buscar" ancho="flexible">
            <input
              type="search"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Concepto, fase, nota, monto…"
              className={CONTROL_COMPACTO}
            />
          </CampoFiltro>
          <CampoFiltro etiqueta="Mes">
            <select
              value={filtroMes}
              onChange={(e) => setFiltroMes(e.target.value)}
              className={CONTROL_COMPACTO}
            >
              <option value="">Todos</option>
              {MESES_FY.map((m) => (
                <option key={m} value={m}>
                  {nombreMes(m)}
                </option>
              ))}
            </select>
          </CampoFiltro>
          <CampoFiltro etiqueta="Hunting Zone">
            <select
              value={filtroHz}
              onChange={(e) => setFiltroHz(e.target.value)}
              className={CONTROL_COMPACTO}
            >
              <option value="">Todas</option>
              {huntingZones.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.nombre}
                </option>
              ))}
            </select>
          </CampoFiltro>
        </BarraFiltros>

        {!soloLectura && (
          <Button type="button" onClick={() => setFormulario("nuevo")} className="gap-1.5">
            <Plus className="size-4" aria-hidden />
            Registrar ingreso
          </Button>
        )}
      </div>

      <p className="mb-2 text-xs text-[var(--muted)]">
        {visibles.length} de {filas.length} {filas.length === 1 ? "registro" : "registros"} ·{" "}
        <strong className="text-[var(--ink)]">{moneda.format(total)}</strong>
        {hayFiltros && (
          <button
            type="button"
            onClick={() => {
              setFiltro("");
              setFiltroMes("");
              setFiltroHz("");
            }}
            className="ml-3 font-semibold text-[var(--blue)] hover:underline"
          >
            Quitar filtros
          </button>
        )}
      </p>

      {filas.length === 0 ? (
        <div className="ui-card px-4 py-10 text-center text-sm text-[var(--muted)]">
          <p>Todavía no hay ingresos cargados en este año fiscal.</p>
          {!soloLectura && (
            <Button type="button" onClick={() => setFormulario("nuevo")} className="mt-4 gap-1.5">
              <Plus className="size-4" aria-hidden />
              Registrar el primero
            </Button>
          )}
        </div>
      ) : (
        <div className="ui-card overflow-x-auto">
          <table className="ui-table min-w-[60rem] text-sm">
            <thead>
              <tr>
                <th className="w-24">Mes</th>
                <th>Hunting Zone</th>
                <th>Concepto</th>
                <th>Fase</th>
                <th>Motivo</th>
                <th>Detalle</th>
                <th>Nota</th>
                <th className="r w-32">Monto</th>
                {!soloLectura && (
                  <th className="w-20">
                    <span className="sr-only">Acciones</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 ? (
                <tr>
                  <td
                    colSpan={soloLectura ? 8 : 9}
                    className="py-8 text-center text-[var(--muted)]"
                  >
                    Ningún ingreso coincide con los filtros.
                  </td>
                </tr>
              ) : (
                visibles.map((f) => (
                  <tr key={f.id}>
                    <td>{nombreMes(f.mes)}</td>
                    <td>{nombreHz.get(f.id_hunting_zone) ?? "—"}</td>
                    <td className="whitespace-normal font-semibold text-[var(--ink)]">
                      {f.concepto}
                    </td>
                    <td>{f.fase ?? "—"}</td>
                    <td>{f.motivo ?? "—"}</td>
                    <td>{f.detalle ?? "—"}</td>
                    <td className="max-w-[16rem] truncate" title={f.nota ?? undefined}>
                      {f.nota ?? "—"}
                    </td>
                    <td
                      className="r font-semibold"
                      style={{ color: f.monto < 0 ? "var(--bad)" : "var(--ink)" }}
                    >
                      {moneda.format(f.monto)}
                    </td>
                    {!soloLectura && (
                      <td>
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            aria-label={`Editar ${f.concepto}`}
                            title="Editar"
                            onClick={() => setFormulario(f)}
                            className="rounded-md p-1.5 text-[var(--blue)] hover:bg-[var(--line-soft)]"
                          >
                            <Pencil className="size-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            aria-label={`Eliminar ${f.concepto}`}
                            title="Eliminar"
                            onClick={() => setABorrar(f)}
                            className="rounded-md p-1.5 text-[var(--bad)] hover:bg-rose-50"
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
