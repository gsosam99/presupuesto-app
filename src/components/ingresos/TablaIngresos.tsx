"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { CampoSugerido, ListaSugerencias } from "@/components/ui/CampoSugerido";
import { CONTROL_CELDA, CONTROL_COMPACTO } from "@/components/ui/estilos";
import { MESES_FY, nombreMes } from "@/lib/fiscal";
import { moneda } from "@/lib/format";

import type { OpcionHz, SugerenciasIngreso } from "./FormularioIngreso";

export interface FilaIngreso {
  id: string;
  mes: number;
  id_hunting_zone: string;
  concepto: string;
  fase: string | null;
  motivo: string | null;
  detalle: string | null;
  monto: number;
  nota: string | null;
}

interface Props {
  filas: FilaIngreso[];
  huntingZones: OpcionHz[];
  sugerencias: SugerenciasIngreso;
}

type Parche = Partial<Omit<FilaIngreso, "id">>;

export function TablaIngresos({ filas, huntingZones, sugerencias }: Props) {
  const router = useRouter();

  const [editando, setEditando] = useState<string | null>(null);
  const [parche, setParche] = useState<Parche>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");

  const nombreHz = useMemo(
    () => new Map(huntingZones.map((h) => [h.id, h.nombre])),
    [huntingZones],
  );

  const visibles = useMemo(() => {
    const texto = filtro.trim().toLowerCase();
    if (texto === "") return filas;
    return filas.filter((f) =>
      [
        f.concepto,
        f.fase,
        f.motivo,
        f.detalle,
        f.nota,
        nombreHz.get(f.id_hunting_zone),
        nombreMes(f.mes),
        String(f.monto),
      ]
        .filter((v): v is string => typeof v === "string")
        .some((v) => v.toLowerCase().includes(texto)),
    );
  }, [filas, filtro, nombreHz]);

  const total = visibles.reduce((s, f) => s + f.monto, 0);

  function abrirEdicion(f: FilaIngreso) {
    setEditando(f.id);
    setParche({});
    setError(null);
  }

  function campo<K extends keyof Parche>(f: FilaIngreso, clave: K): FilaIngreso[K] {
    return (parche[clave] ?? f[clave]) as FilaIngreso[K];
  }

  async function guardar(id: string) {
    if (Object.keys(parche).length === 0) {
      setEditando(null);
      return;
    }

    setOcupado(id);
    setError(null);
    try {
      const res = await fetch("/api/ingresos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...parche }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "No se pudo guardar el cambio.");
        return;
      }
      setEditando(null);
      setParche({});
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setOcupado(null);
    }
  }

  async function borrar(f: FilaIngreso) {
    const etiqueta = `${f.concepto} · ${nombreMes(f.mes)} · ${moneda.format(f.monto)}`;
    if (!window.confirm(`¿Borrar este ingreso?\n\n${etiqueta}\n\nNo se puede deshacer.`)) {
      return;
    }

    setOcupado(f.id);
    setError(null);
    try {
      const res = await fetch(`/api/ingresos?id=${encodeURIComponent(f.id)}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "No se pudo borrar el ingreso.");
        return;
      }
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setOcupado(null);
    }
  }

  if (filas.length === 0) {
    return (
      <p className="ui-card px-4 py-10 text-center text-sm text-[var(--muted)]">
        Todavía no hay ingresos cargados en este año fiscal.
      </p>
    );
  }

  return (
    <div>
      <ListaSugerencias id="sug-concepto" sugerencias={sugerencias.concepto} />
      <ListaSugerencias id="sug-fase" sugerencias={sugerencias.fase} />
      <ListaSugerencias id="sug-motivo" sugerencias={sugerencias.motivo} />
      <ListaSugerencias id="sug-detalle" sugerencias={sugerencias.detalle} />

      {error && (
        <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-[var(--bad)]">
          {error}
        </p>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar…"
          aria-label="Buscar ingresos"
          className={`w-64 ${CONTROL_COMPACTO}`}
        />
        <span className="text-xs text-[var(--muted)]">
          {visibles.length} de {filas.length} · {moneda.format(total)}
        </span>
      </div>

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
              <th className="r w-32">Monto</th>
              <th className="w-32" />
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => {
              const enEdicion = editando === f.id;

              if (!enEdicion) {
                return (
                  <tr key={f.id}>
                    <td className="whitespace-nowrap">{nombreMes(f.mes)}</td>
                    <td>{nombreHz.get(f.id_hunting_zone) ?? "—"}</td>
                    <td className="font-semibold text-[var(--ink)]">{f.concepto}</td>
                    <td>{f.fase ?? "—"}</td>
                    <td>{f.motivo ?? "—"}</td>
                    <td>{f.detalle ?? "—"}</td>
                    <td className="r">{moneda.format(f.monto)}</td>
                    <td className="whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => abrirEdicion(f)}
                        className="mr-3 font-semibold text-[var(--blue)] hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={ocupado === f.id}
                        onClick={() => void borrar(f)}
                        className="text-[var(--bad)] hover:underline disabled:opacity-50"
                      >
                        Borrar
                      </button>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={f.id} className="bg-amber-50">
                  <td>
                    <select
                      aria-label="Mes"
                      value={campo(f, "mes")}
                      onChange={(e) => setParche((p) => ({ ...p, mes: Number(e.target.value) }))}
                      className={CONTROL_CELDA}
                    >
                      {MESES_FY.map((m) => (
                        <option key={m} value={m}>
                          {nombreMes(m)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      aria-label="Hunting Zone"
                      value={campo(f, "id_hunting_zone")}
                      onChange={(e) =>
                        setParche((p) => ({ ...p, id_hunting_zone: e.target.value }))
                      }
                      className={CONTROL_CELDA}
                    >
                      {huntingZones.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.nombre}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <CampoSugerido
                      aria-label="Concepto"
                      idLista="sug-concepto"
                      value={campo(f, "concepto")}
                      onChange={(e) => setParche((p) => ({ ...p, concepto: e.target.value }))}
                      className={CONTROL_CELDA}
                    />
                  </td>
                  <td>
                    <CampoSugerido
                      aria-label="Fase"
                      idLista="sug-fase"
                      value={campo(f, "fase") ?? ""}
                      onChange={(e) => setParche((p) => ({ ...p, fase: e.target.value }))}
                      className={CONTROL_CELDA}
                    />
                  </td>
                  <td>
                    <CampoSugerido
                      aria-label="Motivo"
                      idLista="sug-motivo"
                      value={campo(f, "motivo") ?? ""}
                      onChange={(e) => setParche((p) => ({ ...p, motivo: e.target.value }))}
                      className={CONTROL_CELDA}
                    />
                  </td>
                  <td>
                    <CampoSugerido
                      aria-label="Detalle"
                      idLista="sug-detalle"
                      value={campo(f, "detalle") ?? ""}
                      onChange={(e) => setParche((p) => ({ ...p, detalle: e.target.value }))}
                      className={CONTROL_CELDA}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      aria-label="Monto"
                      value={campo(f, "monto")}
                      onChange={(e) => setParche((p) => ({ ...p, monto: Number(e.target.value) }))}
                      className={CONTROL_CELDA}
                    />
                  </td>
                  <td className="whitespace-nowrap">
                    <button
                      type="button"
                      disabled={ocupado === f.id}
                      onClick={() => void guardar(f.id)}
                      className="mr-3 font-semibold text-[var(--ok)] hover:underline disabled:opacity-50"
                    >
                      {ocupado === f.id ? "Guardando…" : "Guardar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditando(null);
                        setParche({});
                      }}
                      className="text-[var(--muted)] hover:underline"
                    >
                      Cancelar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
