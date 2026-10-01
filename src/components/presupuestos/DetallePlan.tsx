"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Download } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { CONTROL_COMPACTO } from "@/components/ui/estilos";
import { BarraFiltros, CampoFiltro } from "@/components/ui/Filtros";
import { fyEtiqueta, MESES_FY, nombreMes } from "@/lib/fiscal";
import { moneda } from "@/lib/format";
import type { LineaPresupuesto } from "@/lib/presupuesto/lineas";

interface Props {
  fy: number;
  lineas: LineaPresupuesto[];
}

type Vista = "orden" | "macro";

const SIN_MACRO = "(sin macroactividad)";

const suma = (ls: LineaPresupuesto[]): number => ls.reduce((s, l) => s + l.monto, 0);

/** Agrupa preservando el orden de aparición de las claves. */
function agrupar<T>(items: T[], clave: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = clave(it);
    const lista = m.get(k);
    if (lista) lista.push(it);
    else m.set(k, [it]);
  }
  return m;
}

/** Orden del año fiscal: octubre primero. */
const ordenMes = (mes: number): number => (mes + 2) % 12;

/**
 * Detalle auditable del presupuesto cargado: cada línea con su mes, cuenta,
 * detalle, macroactividad y responsable. Se recorre por orden/CeCo →
 * macroactividad → línea, o por macroactividad, y se exporta lo filtrado.
 */
export function DetallePlan({ fy, lineas }: Props) {
  const [vista, setVista] = useState<Vista>("orden");
  const [texto, setTexto] = useState("");
  const [unidad, setUnidad] = useState("");
  const [macro, setMacro] = useState("");
  const [mes, setMes] = useState("");
  const [responsable, setResponsable] = useState("");
  const [tipo, setTipo] = useState("");
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [exportando, setExportando] = useState(false);

  const unidades = useMemo(
    () =>
      [...agrupar(lineas, (l) => l.claveUnidad).values()]
        .map((ls) => ({
          clave: ls[0].claveUnidad,
          codigo: ls[0].codigoUnidad,
          nombre: ls[0].nombreUnidad,
        }))
        .sort((a, b) => a.codigo.localeCompare(b.codigo, "es")),
    [lineas],
  );
  const macros = useMemo(
    () =>
      [...new Set(lineas.map((l) => l.macroactividad ?? SIN_MACRO))].sort((a, b) =>
        a.localeCompare(b, "es"),
      ),
    [lineas],
  );
  const responsables = useMemo(
    () => [...new Set(lineas.flatMap((l) => (l.responsable ? [l.responsable] : [])))].sort(),
    [lineas],
  );

  const visibles = useMemo(() => {
    const t = texto.trim().toLowerCase();
    return lineas
      .filter((l) => {
        if (unidad && l.claveUnidad !== unidad) return false;
        if (macro && (l.macroactividad ?? SIN_MACRO) !== macro) return false;
        if (mes && l.mes !== Number(mes)) return false;
        if (responsable && l.responsable !== responsable) return false;
        if (tipo && l.tipo !== tipo) return false;
        if (t === "") return true;
        return [
          l.detalle,
          l.cuenta,
          l.descripcionCuenta,
          l.macroactividad,
          l.responsable,
          l.codigoUnidad,
          l.nombreUnidad,
        ].some((v) => v?.toLowerCase().includes(t));
      })
      .sort(
        (a, b) =>
          a.codigoUnidad.localeCompare(b.codigoUnidad, "es") ||
          (a.macroactividad ?? "").localeCompare(b.macroactividad ?? "", "es") ||
          ordenMes(a.mes) - ordenMes(b.mes) ||
          (a.detalle ?? "").localeCompare(b.detalle ?? "", "es"),
      );
  }, [lineas, texto, unidad, macro, mes, responsable, tipo]);

  const hayFiltros = Boolean(texto || unidad || macro || mes || responsable || tipo);
  const total = suma(visibles);

  function alternar(clave: string) {
    setAbiertos((s) => {
      const n = new Set(s);
      if (n.has(clave)) n.delete(clave);
      else n.add(clave);
      return n;
    });
  }

  function limpiar() {
    setTexto("");
    setUnidad("");
    setMacro("");
    setMes("");
    setResponsable("");
    setTipo("");
  }

  async function exportar() {
    setExportando(true);
    try {
      // Bajo demanda: exceljs no entra en el JS de la página.
      const { default: ExcelJS } = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(`Plan ${fyEtiqueta(fy)}`);
      ws.columns = [
        { header: "Orden Interna / CeCo", key: "unidad", width: 18 },
        { header: "Nombre de la orden", key: "nombre", width: 34 },
        { header: "Hunting Zone", key: "hz", width: 20 },
        { header: "Tipo de presupuesto", key: "tipo", width: 16 },
        { header: "Mes", key: "mes", width: 12 },
        { header: "Cuenta contable", key: "cuenta", width: 15 },
        { header: "Detalle del gasto", key: "detalle", width: 60 },
        { header: "Macroactividad", key: "macro", width: 46 },
        { header: "Responsable", key: "responsable", width: 20 },
        { header: "Monto (USD)", key: "monto", width: 14, style: { numFmt: "#,##0.00" } },
      ];
      for (const l of visibles) {
        ws.addRow({
          unidad: l.codigoUnidad,
          nombre: l.nombreUnidad ?? "",
          hz: l.huntingZone ?? "",
          tipo: l.tipo === "plan" ? "Plan base" : "Extra Plan",
          mes: nombreMes(l.mes),
          cuenta: l.cuenta ?? "",
          detalle: l.detalle ?? "",
          macro: l.macroactividad ?? "",
          responsable: l.responsable ?? "",
          monto: l.monto,
        });
      }
      ws.getRow(1).font = { bold: true };
      ws.views = [{ state: "frozen", ySplit: 1 }];
      ws.autoFilter = { from: "A1", to: "J1" };

      const buffer = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(
        new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `Plan ${fyEtiqueta(fy).replace("/", "-")}${hayFiltros ? " (filtrado)" : ""}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportando(false);
    }
  }

  if (lineas.length === 0) {
    return (
      <p className="ui-card px-4 py-10 text-center text-sm text-[var(--muted)]">
        Todavía no hay presupuesto cargado para {fyEtiqueta(fy)}.
      </p>
    );
  }

  const porUnidad = agrupar(visibles, (l) => l.claveUnidad);
  const porMacro = [...agrupar(visibles, (l) => l.macroactividad ?? SIN_MACRO).entries()].sort(
    (a, b) => suma(b[1]) - suma(a[1]),
  );

  return (
    <div>
      <BarraFiltros>
        <CampoFiltro etiqueta="Buscar" ancho="flexible">
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Detalle, cuenta, macroactividad…"
            className={CONTROL_COMPACTO}
          />
        </CampoFiltro>
        <CampoFiltro etiqueta="Orden / CeCo">
          <select
            value={unidad}
            onChange={(e) => setUnidad(e.target.value)}
            className={CONTROL_COMPACTO}
          >
            <option value="">Todas</option>
            {unidades.map((u) => (
              <option key={u.clave} value={u.clave}>
                {u.codigo}
                {u.nombre && !u.codigo.startsWith("CeCo") ? ` · ${u.nombre}` : ""}
              </option>
            ))}
          </select>
        </CampoFiltro>
        <CampoFiltro etiqueta="Macroactividad">
          <select
            value={macro}
            onChange={(e) => setMacro(e.target.value)}
            className={CONTROL_COMPACTO}
          >
            <option value="">Todas</option>
            {macros.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </CampoFiltro>
        <CampoFiltro etiqueta="Mes">
          <select value={mes} onChange={(e) => setMes(e.target.value)} className={CONTROL_COMPACTO}>
            <option value="">Todos</option>
            {MESES_FY.map((m) => (
              <option key={m} value={m}>
                {nombreMes(m)}
              </option>
            ))}
          </select>
        </CampoFiltro>
        <CampoFiltro etiqueta="Responsable">
          <select
            value={responsable}
            onChange={(e) => setResponsable(e.target.value)}
            className={CONTROL_COMPACTO}
          >
            <option value="">Todos</option>
            {responsables.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </CampoFiltro>
        <CampoFiltro etiqueta="Tipo">
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className={CONTROL_COMPACTO}
          >
            <option value="">Plan y Extra Plan</option>
            <option value="plan">Plan base</option>
            <option value="extra_plan">Extra Plan</option>
          </select>
        </CampoFiltro>
      </BarraFiltros>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--ink-soft)]">
          <strong className="text-[var(--ink)]">{visibles.length}</strong> de {lineas.length} líneas
          · <strong className="text-[var(--ink)]">{moneda.format(total)}</strong>
          {hayFiltros && (
            <button
              type="button"
              onClick={limpiar}
              className="ml-3 text-xs font-semibold text-[var(--blue)] hover:underline"
            >
              Quitar filtros
            </button>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="tablist"
            aria-label="Agrupar por"
            className="flex rounded-md border border-[var(--line)] bg-white p-0.5 text-xs"
          >
            {(
              [
                ["orden", "Por orden"],
                ["macro", "Por macroactividad"],
              ] as const
            ).map(([v, etiqueta]) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={vista === v}
                onClick={() => setVista(v)}
                className={
                  "rounded px-3 py-1 font-semibold " +
                  (vista === v
                    ? "bg-[var(--navy)] text-white"
                    : "text-[var(--ink-soft)] hover:bg-[var(--line-soft)]")
                }
              >
                {etiqueta}
              </button>
            ))}
          </div>
          <Button
            type="button"
            variante="secundario"
            cargando={exportando}
            disabled={visibles.length === 0}
            onClick={() => void exportar()}
            className="px-3 py-1.5"
          >
            {!exportando && <Download className="size-4" aria-hidden />}
            Exportar a Excel
          </Button>
        </div>
      </div>

      {visibles.length === 0 ? (
        <p className="ui-card mt-4 px-4 py-8 text-center text-sm text-[var(--muted)]">
          Ninguna línea coincide con los filtros.
        </p>
      ) : vista === "macro" ? (
        <div className="ui-card mt-4 overflow-x-auto">
          <table className="ui-table min-w-[44rem] text-sm">
            <thead>
              <tr>
                <th>Macroactividad</th>
                <th>Órdenes / CeCo</th>
                <th className="r">Líneas</th>
                <th className="r">Monto</th>
                <th className="r">% del total</th>
              </tr>
            </thead>
            <tbody>
              {porMacro.map(([m, ls]) => (
                <tr key={m}>
                  <td className="whitespace-normal">
                    <button
                      type="button"
                      onClick={() => {
                        setMacro(m);
                        setVista("orden");
                      }}
                      className="text-left font-semibold text-[var(--blue)] hover:underline"
                      title="Ver sus líneas"
                    >
                      {m}
                    </button>
                  </td>
                  <td className="whitespace-normal text-xs text-[var(--muted)]">
                    {[...new Set(ls.map((l) => l.codigoUnidad))].join(", ")}
                  </td>
                  <td className="r">{ls.length}</td>
                  <td className="r font-semibold text-[var(--ink)]">{moneda.format(suma(ls))}</td>
                  <td className="r">
                    {total > 0 ? `${((suma(ls) / total) * 100).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="ui-card mt-4 overflow-x-auto">
          <table className="ui-table min-w-[64rem] text-xs">
            <thead>
              <tr>
                <th>Orden / macroactividad / línea</th>
                <th>Mes</th>
                <th>Cuenta</th>
                <th>Responsable</th>
                <th className="r">Líneas</th>
                <th className="r">Monto</th>
              </tr>
            </thead>
            {[...porUnidad.entries()].map(([claveU, lsU]) => {
              const abiertaU = abiertos.has(claveU) || hayFiltros;
              const primera = lsU[0];
              return (
                <tbody key={claveU}>
                  <tr className="bg-[var(--line-soft)]">
                    <td className="whitespace-normal">
                      <button
                        type="button"
                        aria-expanded={abiertaU}
                        onClick={() => alternar(claveU)}
                        className="inline-flex items-center gap-1.5 font-semibold text-[var(--navy)]"
                      >
                        <ChevronRight
                          className={`size-4 transition-transform ${abiertaU ? "rotate-90" : ""}`}
                          aria-hidden
                        />
                        <span className="font-mono">{primera.codigoUnidad}</span>
                        {primera.nombreUnidad && primera.tipoUnidad === "oi" && (
                          <span className="font-normal text-[var(--ink-soft)]">
                            · {primera.nombreUnidad}
                          </span>
                        )}
                      </button>
                    </td>
                    <td colSpan={3} className="text-[var(--muted)]">
                      {primera.huntingZone ??
                        (primera.tipoUnidad === "ceco" ? "Centro de Costo" : "")}
                    </td>
                    <td className="r">{lsU.length}</td>
                    <td className="r font-bold text-[var(--ink)]">{moneda.format(suma(lsU))}</td>
                  </tr>
                  {abiertaU &&
                    [...agrupar(lsU, (l) => l.macroactividad ?? SIN_MACRO).entries()].map(
                      ([m, lsM]) => {
                        const claveM = `${claveU}|${m}`;
                        // Buscando o filtrando por macroactividad, lo que se busca son las líneas.
                        const abiertaM = abiertos.has(claveM) || Boolean(macro || texto.trim());
                        return [
                          <tr key={claveM}>
                            <td className="whitespace-normal pl-8">
                              <button
                                type="button"
                                aria-expanded={abiertaM}
                                onClick={() => alternar(claveM)}
                                className="inline-flex items-center gap-1.5 text-left font-semibold text-[var(--ink)]"
                              >
                                <ChevronRight
                                  className={`size-3.5 shrink-0 transition-transform ${abiertaM ? "rotate-90" : ""}`}
                                  aria-hidden
                                />
                                {m}
                              </button>
                            </td>
                            <td colSpan={3} />
                            <td className="r">{lsM.length}</td>
                            <td className="r font-semibold text-[var(--ink)]">
                              {moneda.format(suma(lsM))}
                            </td>
                          </tr>,
                          ...(abiertaM
                            ? lsM.map((l) => (
                                <tr key={l.id} className="text-[var(--ink-soft)]">
                                  <td className="whitespace-normal pl-16">
                                    {l.detalle ?? "—"}
                                    {l.tipo === "extra_plan" && (
                                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                        Extra Plan
                                      </span>
                                    )}
                                  </td>
                                  <td>{nombreMes(l.mes)}</td>
                                  <td
                                    className="font-mono"
                                    title={l.descripcionCuenta ?? undefined}
                                  >
                                    {l.cuenta ?? "—"}
                                  </td>
                                  <td>{l.responsable ?? "—"}</td>
                                  <td />
                                  <td className="r">{moneda.format(l.monto)}</td>
                                </tr>
                              ))
                            : []),
                        ];
                      },
                    )}
                </tbody>
              );
            })}
          </table>
        </div>
      )}
    </div>
  );
}
