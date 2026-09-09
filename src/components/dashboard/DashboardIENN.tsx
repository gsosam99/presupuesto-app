"use client";

/**
 * Dashboard de seguimiento presupuestario — port del HTML aprobado por el equipo.
 *
 * Se mantienen la estructura, los nombres de clase y la lógica del archivo
 * original para que la revisión visual sea 1:1. Los únicos cambios pedidos:
 * todos los gráficos llevan título y leyenda.
 *
 * La diferencia de fondo es la fuente de datos: en vez de un bloque embebido,
 * los registros llegan agregados desde Supabase.
 */

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  Chart,
  type ChartConfiguration,
  type Plugin,
  registerables,
} from "chart.js";

import { MenuExportar } from "@/components/dashboard/MenuExportar";
import type { DatosDashboard, RegistroDashboard } from "@/types";

Chart.register(...registerables);

const PALETTE = [
  "#2E75B6", "#2FB9CE", "#E0A93E", "#1E8A8A", "#9E2B33", "#A97C86",
  "#0C3A57", "#6E8FA3", "#C6832F", "#4B6B7E", "#7C9AAD", "#B0563E",
];

const FASE_COLORS: Record<string, string> = {
  "Ideación": "#2FB9CE",
  "Incubación": "#2E75B6",
  "Escalamiento": "#1E8A8A",
  "Continuidad Operativa": "#E0A93E",
  "(sin asignar)": "#B7C1C9",
};

const NA_RE = /sin asignar|no aplica/i;

const fmtUSD = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const fmtAbbr = (n: number) =>
  n >= 1e6
    ? "$" + (n / 1e6).toFixed(2) + "M"
    : n >= 1e3
      ? "$" + (n / 1e3).toFixed(0) + "K"
      : "$" + Math.round(n);
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);

// ---------------------------------------------------------------------------
// Plugins de Chart.js (portados del original)
// ---------------------------------------------------------------------------

const stackTotals: Plugin<"bar"> = {
  id: "stackTotals",
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx;
    chart.data.labels?.forEach((_lab, i) => {
      let exec = 0;
      let topY: number | null = null;
      let cx: number | null = null;
      chart.data.datasets.forEach((ds, di) => {
        const m = chart.getDatasetMeta(di);
        if (m.hidden) return;
        const el = m.data[i];
        if (!el) return;
        cx = el.x;
        if (topY === null || el.y < topY) topY = el.y;
        if (!(ds as { isProjection?: boolean }).isProjection) {
          exec += Number(ds.data[i]) || 0;
        }
      });
      const x: number | null = cx;
      const y: number | null = topY;
      if (exec > 0 && x !== null && y !== null) {
        ctx.save();
        ctx.font = "700 11.5px Inter,sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#fff";
        ctx.strokeText(fmtAbbr(exec), x, y - 6);
        ctx.fillStyle = "#12324D";
        ctx.fillText(fmtAbbr(exec), x, y - 6);
        ctx.restore();
      }
    });
  },
};

const hbarValues: Plugin<"bar"> = {
  id: "hbarValues",
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx;
    const m = chart.getDatasetMeta(0);
    const ds = chart.data.datasets[0];
    m.data.forEach((el, i) => {
      const v = Number(ds.data[i]) || 0;
      if (!v) return;
      ctx.save();
      ctx.font = "600 11px Inter,sans-serif";
      ctx.fillStyle = "#31465A";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(fmtAbbr(v), Number(el.x) + 7, Number(el.y));
      ctx.restore();
    });
  },
};

const pieLabels: Plugin<"pie"> = {
  id: "pieLabels",
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx;
    const meta = chart.getDatasetMeta(0);
    const ds = chart.data.datasets[0];
    const tot = (ds.data as number[]).reduce((s, v) => s + v, 0);
    meta.data.forEach((el, i) => {
      const p = ((ds.data[i] as number) / tot) * 100;
      if (p < 5) return;
      const pos = el.tooltipPosition(true);
      ctx.save();
      ctx.font = "700 11px Inter,sans-serif";
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.toFixed(0) + "%", Number(pos.x), Number(pos.y));
      ctx.restore();
    });
  },
};

const leyendaDe = (position: "top" | "right" = "top") => ({
  display: true,
  position,
  labels: {
    boxWidth: 11,
    font: { size: 10.5 },
    padding: 8,
    color: "#31465A",
  },
});

// ---------------------------------------------------------------------------
// Hook de gráfico
// ---------------------------------------------------------------------------

function useChart(config: ChartConfiguration | null) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const instancia = useRef<Chart | null>(null);

  useEffect(() => {
    if (!ref.current || !config) return;
    instancia.current?.destroy();
    instancia.current = new Chart(ref.current, config);
    return () => {
      instancia.current?.destroy();
      instancia.current = null;
    };
  }, [config]);

  return ref;
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

type Pestana = "resumen" | "motivo" | "hz" | "pivot";

export function DashboardIENN({
  datos,
  enPresentacion = false,
}: {
  datos: DatosDashboard;
  enPresentacion?: boolean;
}) {
  // El color se reparte por el ORDEN DE LA MAESTRA, no por la posición en
  // `hzs`: esa lista va ordenada por monto, así que usarla acá haría que los
  // colores bailaran cada mes al moverse el ranking.
  const hzColors = useMemo(() => {
    const m: Record<string, string> = {};
    datos.hzs.forEach((h) => {
      if (NA_RE.test(h)) {
        m[h] = "#B7C1C9";
        return;
      }
      const i = datos.hzOrdenPaleta.indexOf(h);
      m[h] = PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
    });
    return m;
  }, [datos.hzs, datos.hzOrdenPaleta]);

  // El modo presentación se marca en <html> para que el CSS pueda ocultar la
  // navegación de la app sin depender de headers ni de props que atraviesen
  // el layout.
  useEffect(() => {
    const raiz = document.documentElement;
    if (enPresentacion) raiz.setAttribute("data-presentacion", "1");
    else raiz.removeAttribute("data-presentacion");
    return () => raiz.removeAttribute("data-presentacion");
  }, [enPresentacion]);

  const [tab, setTab] = useState<Pestana>("resumen");
  // Al imprimir se montan las cuatro secciones para que el PDF salga completo
  // (Resumen, Motivo, Hunting Zone y Tabla dinámica), no solo la pestaña activa.
  const [imprimiendo, setImprimiendo] = useState(false);
  const [seg, setSeg] = useState<"fase" | "hz">("fase");
  const [yrFrom, setYrFrom] = useState(0);
  const [yrTo, setYrTo] = useState(Math.max(0, datos.anios.length - 1));
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [hzMarcadas, setHzMarcadas] = useState<Set<string>>(
    () => new Set(datos.hzs.filter((h) => !NA_RE.test(h))),
  );
  const [rev, setRev] = useState("");
  const [planInv, setPlanInv] = useState("");
  const [motAbiertos, setMotAbiertos] = useState<Set<number>>(new Set());
  const [pivotExpandido, setPivotExpandido] = useState<Set<string>>(new Set());
  const [hzModal, setHzModal] = useState<string | null>(null);
  const [pmAbiertos, setPmAbiertos] = useState<Set<number>>(new Set());

  // --- Selección ------------------------------------------------------------
  const selYears = useMemo(
    () => datos.anios.slice(yrFrom, yrTo + 1),
    [datos.anios, yrFrom, yrTo],
  );

  const todasMarcadas = hzMarcadas.size === datos.hzs.length;

  const hzOnly = useMemo(
    () => datos.records.filter((r) => todasMarcadas || hzMarcadas.has(r.hz)),
    [datos.records, hzMarcadas, todasMarcadas],
  );

  const rows = useMemo(() => {
    const ys = new Set(selYears);
    return hzOnly.filter((r) => ys.has(r.af));
  }, [hzOnly, selYears]);

  // Los ingresos pasan por los MISMOS dos filtros que los gastos (Hunting Zone
  // marcada y rango de años), para que el neto compare peras con peras.
  const ingresosHz = useMemo(
    () => datos.ingresos.filter((r) => todasMarcadas || hzMarcadas.has(r.hz)),
    [datos.ingresos, hzMarcadas, todasMarcadas],
  );

  const ingresosRows = useMemo(() => {
    const ys = new Set(selYears);
    return ingresosHz.filter((r) => ys.has(r.af));
  }, [ingresosHz, selYears]);

  const total = (rs: RegistroDashboard[]) => rs.reduce((s, r) => s + r.monto, 0);

  const mesesTranscurridos = useMemo(() => {
    const mm = datos.monthlyCurrent;
    const keys = Object.keys(mm).sort();
    if (!keys.length) return 12;
    const vals = keys.map((k) => mm[k]).sort((a, b) => a - b);
    const med = vals[Math.floor(vals.length / 2)] || 1;
    let end = keys.length;
    while (end > 0 && mm[keys[end - 1]] < 0.2 * med) end--;
    return Math.max(1, Math.min(12, end));
  }, [datos.monthlyCurrent]);

  const projShown = selYears.includes(datos.currentFY);

  const scopeText = useMemo(() => {
    const partes = [
      selYears.length
        ? selYears.length > 1
          ? selYears[0] + "–" + selYears[selYears.length - 1]
          : "FY " + selYears[0]
        : "—",
    ];
    if (!todasMarcadas) partes.push(hzMarcadas.size + " HZ");
    return partes.join(" · ");
  }, [selYears, todasMarcadas, hzMarcadas]);

  // --- Benchmark ------------------------------------------------------------
  const gTot = total(rows);
  const iTot = total(ingresosRows);
  const netTot = iTot - gTot;
  const revNum = Number(rev.replace(/[^\d]/g, "")) || 0;
  const planNum = Number(planInv.replace(/[^\d]/g, "")) || 0;

  const montoInput = (setter: (v: string) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/[^\d]/g, "");
    setter(v ? Number(v).toLocaleString("en-US") : "");
  };

  // --- KPIs -----------------------------------------------------------------
  const cur = datos.currentFY;
  const prev = datos.anios[datos.anios.indexOf(cur) - 1];
  const curTot = total(hzOnly.filter((r) => r.af === cur));
  const prevTot = total(hzOnly.filter((r) => r.af === prev));
  const deltaPct = prevTot > 0 ? pct(curTot - prevTot, prevTot) : null;
  const periodo = selYears.length
    ? selYears.length > 1
      ? selYears[0] + " – " + selYears[selYears.length - 1]
      : "FY " + selYears[0]
    : "—";

  // --- Resumen: matrices ----------------------------------------------------
  const { dims, acc, mtx } = useMemo(() => {
    const acc: Record<string, number> = {};
    const mtx: Record<string, Record<string, number>> = {};
    rows.forEach((r) => {
      const d = seg === "fase" ? r.fase : r.hz;
      acc[d] = (acc[d] || 0) + r.monto;
      mtx[r.af] = mtx[r.af] || {};
      mtx[r.af][d] = (mtx[r.af][d] || 0) + r.monto;
    });
    const dims = (seg === "fase" ? datos.fases.filter((f) => acc[f]) : Object.keys(acc)).sort(
      (a, b) => (acc[b] || 0) - (acc[a] || 0),
    );
    return { dims, acc, mtx };
  }, [rows, seg, datos.fases]);

  const colorOf = useCallback(
    (d: string) => (seg === "fase" ? (FASE_COLORS[d] ?? "#8FB4C9") : (hzColors[d] ?? "#8FB4C9")),
    [seg, hzColors],
  );

  const cfgAnio = useMemo<ChartConfiguration | null>(() => {
    if (tab !== "resumen" && !imprimiendo) return null;
    const years = selYears;
    const dsDims = dims.map((d) => ({
      label: d,
      data: years.map((y) => mtx[y]?.[d] ?? 0),
      backgroundColor: colorOf(d),
      stack: "s",
      maxBarThickness: 70,
      borderRadius: 1,
    }));
    const execByYr = years.map((y) => dims.reduce((s, d) => s + (mtx[y]?.[d] ?? 0), 0));
    const proj = years.map((y, i) =>
      y === datos.currentFY && projShown
        ? Math.max(0, execByYr[i] * (12 / mesesTranscurridos) - execByYr[i])
        : 0,
    );

    return {
      type: "bar",
      plugins: [stackTotals],
      data: {
        labels: years,
        datasets: [
          ...dsDims,
          {
            label: "Proyección estimada",
            data: proj,
            isProjection: true,
            backgroundColor: "rgba(46,117,182,.22)",
            borderColor: "#2E75B6",
            borderWidth: { top: 1.5, left: 1, right: 1, bottom: 0 },
            borderDash: [4, 3],
            stack: "s",
            maxBarThickness: 70,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        layout: { padding: { top: 24 } },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: {
            stacked: true,
            ticks: { callback: (v) => fmtAbbr(Number(v)) },
            grid: { color: "#EEF2F5" },
            grace: "8%",
          },
        },
        plugins: {
          legend: leyendaDe("top"),
          tooltip: {
            filter: (i) => Number(i.raw) > 0,
            callbacks: { label: (c) => " " + c.dataset.label + ": " + fmtUSD(Number(c.raw)) },
          },
        },
      },
    } as ChartConfiguration;
  }, [tab, imprimiendo, selYears, dims, mtx, colorOf, datos.currentFY, projShown, mesesTranscurridos]);

  /** Ingresos contra gastos por año fiscal, con el neto como línea. */
  const cfgIngresos = useMemo<ChartConfiguration | null>(() => {
    if (tab !== "resumen" && !imprimiendo) return null;
    if (datos.ingresos.length === 0) return null;

    const years = selYears;
    const gastoPorAf = new Map<string, number>();
    for (const r of rows) gastoPorAf.set(r.af, (gastoPorAf.get(r.af) ?? 0) + r.monto);
    const ingresoPorAf = new Map<string, number>();
    for (const r of ingresosRows) ingresoPorAf.set(r.af, (ingresoPorAf.get(r.af) ?? 0) + r.monto);

    const gastos = years.map((y) => gastoPorAf.get(y) ?? 0);
    const ingresos = years.map((y) => ingresoPorAf.get(y) ?? 0);

    return {
      type: "bar",
      data: {
        labels: years,
        datasets: [
          {
            label: "Ingresos",
            data: ingresos,
            backgroundColor: "#1E8A8A",
            maxBarThickness: 46,
            borderRadius: 1,
          },
          {
            label: "Gastos",
            data: gastos,
            backgroundColor: "#9E2B33",
            maxBarThickness: 46,
            borderRadius: 1,
          },
          {
            label: "Neto",
            type: "line",
            data: years.map((_, i) => ingresos[i] - gastos[i]),
            borderColor: "#0C3A57",
            backgroundColor: "#0C3A57",
            borderWidth: 2,
            tension: 0.25,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        scales: {
          x: { grid: { display: false } },
          y: {
            ticks: { callback: (v) => fmtAbbr(Number(v)) },
            grid: { color: "#EEF2F5" },
            grace: "8%",
          },
        },
        plugins: {
          legend: leyendaDe("top"),
          tooltip: {
            callbacks: { label: (c) => " " + c.dataset.label + ": " + fmtUSD(Number(c.raw)) },
          },
        },
      },
    } as ChartConfiguration;
  }, [tab, imprimiendo, datos.ingresos.length, selYears, rows, ingresosRows]);

  const cfgComp = useMemo<ChartConfiguration | null>(() => {
    if (tab !== "resumen" && !imprimiendo) return null;
    const gtot = dims.reduce((s, d) => s + acc[d], 0);
    return {
      type: "pie",
      plugins: [pieLabels],
      data: {
        labels: dims,
        datasets: [
          {
            label: "Gasto acumulado",
            data: dims.map((d) => acc[d]),
            backgroundColor: dims.map(colorOf),
            borderWidth: 2,
            borderColor: "#fff",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        plugins: {
          legend: leyendaDe("right"),
          tooltip: {
            callbacks: {
              label: (c) =>
                " " + c.label + ": " + fmtUSD(c.parsed) + " (" + pct(c.parsed, gtot).toFixed(0) + "%)",
            },
          },
        },
      },
    } as ChartConfiguration;
  }, [tab, imprimiendo, dims, acc, colorOf]);

  // --- Motivo ---------------------------------------------------------------
  const byMotivo = useMemo(() => {
    const byM: Record<string, { monto: number; hz: Record<string, number> }> = {};
    rows.forEach((r) => {
      const o = (byM[r.motivo] = byM[r.motivo] || { monto: 0, hz: {} });
      o.monto += r.monto;
      o.hz[r.hz] = (o.hz[r.hz] || 0) + r.monto;
    });
    return byM;
  }, [rows]);

  const motivosOrdenados = useMemo(
    () => Object.keys(byMotivo).sort((a, b) => byMotivo[b].monto - byMotivo[a].monto),
    [byMotivo],
  );

  const cfgMotivo = useMemo<ChartConfiguration | null>(() => {
    if (tab !== "motivo" && !imprimiendo) return null;
    const top = motivosOrdenados.slice(0, 15);
    return {
      type: "bar",
      plugins: [hbarValues],
      data: {
        labels: top,
        datasets: [
          {
            label: "Gasto del período (USD)",
            data: top.map((m) => byMotivo[m].monto),
            backgroundColor: "#2FB9CE",
            borderRadius: 4,
            maxBarThickness: 22,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        indexAxis: "y",
        layout: { padding: { right: 56 } },
        scales: {
          x: {
            ticks: { callback: (v) => fmtAbbr(Number(v)) },
            grid: { color: "#EEF2F5" },
            grace: "6%",
          },
          y: { grid: { display: false }, ticks: { font: { size: 11 } } },
        },
        plugins: {
          legend: leyendaDe("top"),
          tooltip: { callbacks: { label: (c) => " " + fmtUSD(Number(c.raw)) } },
        },
      },
    } as ChartConfiguration;
  }, [tab, imprimiendo, motivosOrdenados, byMotivo]);

  const refAnio = useChart(cfgAnio);
  const refComp = useChart(cfgComp);
  const refIngresos = useChart(cfgIngresos);
  const refMotivo = useChart(cfgMotivo);

  // --- Hunting Zone ---------------------------------------------------------
  const byHz = useMemo(() => {
    const m: Record<string, { monto: number; mot: Record<string, number> }> = {};
    rows.forEach((r) => {
      m[r.hz] = m[r.hz] || { monto: 0, mot: {} };
      m[r.hz].monto += r.monto;
      m[r.hz].mot[r.motivo] = (m[r.hz].mot[r.motivo] || 0) + r.monto;
    });
    return m;
  }, [rows]);

  const hzOrdenadas = useMemo(
    () => Object.keys(byHz).sort((a, b) => byHz[b].monto - byHz[a].monto),
    [byHz],
  );

  // --- Pivot ----------------------------------------------------------------
  const arbol = useMemo(() => {
    const tree: Record<
      string,
      {
        t: number;
        yr: Record<string, number>;
        mot: Record<string, { t: number; yr: Record<string, number>; det: Record<string, { t: number; yr: Record<string, number> }> }>;
      }
    > = {};
    rows.forEach((r) => {
      const H = (tree[r.hz] = tree[r.hz] || { t: 0, yr: {}, mot: {} });
      H.t += r.monto;
      H.yr[r.af] = (H.yr[r.af] || 0) + r.monto;
      const M = (H.mot[r.motivo] = H.mot[r.motivo] || { t: 0, yr: {}, det: {} });
      M.t += r.monto;
      M.yr[r.af] = (M.yr[r.af] || 0) + r.monto;
      const D = (M.det[r.detalle] = M.det[r.detalle] || { t: 0, yr: {} });
      D.t += r.monto;
      D.yr[r.af] = (D.yr[r.af] || 0) + r.monto;
    });
    return tree;
  }, [rows]);

  const totalesMarcados = useMemo(() => {
    const by: Record<string, number> = {};
    datos.records.forEach((r) => {
      by[r.hz] = (by[r.hz] || 0) + r.monto;
    });
    return by;
  }, [datos.records]);

  function resetFiltros() {
    setYrFrom(0);
    setYrTo(datos.anios.length - 1);
    setHzMarcadas(new Set(datos.hzs.filter((h) => !NA_RE.test(h))));
  }

  function alternarHz(h: string) {
    setHzMarcadas((prev) => {
      const c = new Set(prev);
      if (c.has(h)) c.delete(h);
      else c.add(h);
      return c;
    });
  }

  const excluirNA = datos.hzs.filter((h) => NA_RE.test(h)).every((h) => !hzMarcadas.has(h));

  const nMax = Math.max(1, datos.anios.length - 1);

  return (
    <div className="dash">
      <div className="wrap">
        <header className="topbar">
          <div className="topbar-row">
            <div>
              <div className="eyebrow">
                Innovación, Estrategia y Nuevos Negocios · Empresas Polar
              </div>
              <h1>Seguimiento Presupuestario del Área</h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="asof">
                Corte: <b>{datos.asof || "—"}</b>
              </div>
              <MenuExportar
                enPresentacion={enPresentacion}
                onAntesDeImprimir={setImprimiendo}
              />
            </div>
          </div>

          <div className="filters">
            <div className="fg range">
              <label>Período (años fiscales)</label>
              <div className="range-labels">
                <b>{datos.anios[yrFrom]}</b> &nbsp;—&nbsp; <b>{datos.anios[yrTo]}</b>
              </div>
              <div className="range-slider">
                <div className="range-track" />
                <div
                  className="range-fill"
                  style={{
                    left: `${(yrFrom / nMax) * 100}%`,
                    width: `${((yrTo - yrFrom) / nMax) * 100}%`,
                  }}
                />
                <input
                  id="yr-from"
                  type="range"
                  min={0}
                  max={nMax}
                  step={1}
                  value={yrFrom}
                  aria-label="Año fiscal desde"
                  onChange={(e) => setYrFrom(Math.min(Number(e.target.value), yrTo))}
                />
                <input
                  type="range"
                  min={0}
                  max={nMax}
                  step={1}
                  value={yrTo}
                  aria-label="Año fiscal hasta"
                  onChange={(e) => setYrTo(Math.max(Number(e.target.value), yrFrom))}
                />
              </div>
            </div>

            <div className="fg">
              <label>Hunting Zone</label>
              <button
                type="button"
                className="ms-btn"
                onClick={() => setPanelAbierto((v) => !v)}
              >
                {todasMarcadas
                  ? "Todas las zonas"
                  : hzMarcadas.size === 0
                    ? "Ninguna zona"
                    : `${hzMarcadas.size} de ${datos.hzs.length} zonas`}
              </button>

              {panelAbierto && (
                <div className="ms-panel">
                  <div className="ms-actions">
                    <button
                      type="button"
                      className="link"
                      onClick={() => setHzMarcadas(new Set(datos.hzs))}
                    >
                      Todas
                    </button>
                    <button type="button" className="link" onClick={() => setHzMarcadas(new Set())}>
                      Ninguna
                    </button>
                    <label className="ms-excl">
                      <input
                        type="checkbox"
                        checked={excluirNA}
                        onChange={(e) =>
                          setHzMarcadas((prev) => {
                            const c = new Set(prev);
                            datos.hzs
                              .filter((h) => NA_RE.test(h))
                              .forEach((h) => (e.target.checked ? c.delete(h) : c.add(h)));
                            return c;
                          })
                        }
                      />{" "}
                      Excluir no asignados / N/A
                    </label>
                  </div>
                  <div className="ms-list">
                    {datos.hzs.map((h) => (
                      <label className="ms-item" key={h}>
                        <input
                          type="checkbox"
                          checked={hzMarcadas.has(h)}
                          onChange={() => alternarHz(h)}
                        />
                        <span>{h}</span>
                        <span className="amt">{fmtAbbr(totalesMarcados[h] ?? 0)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button type="button" className="btn-reset" onClick={resetFiltros}>
              Limpiar
            </button>
          </div>
        </header>

        <nav className="tabs no-print">
          {(
            [
              ["resumen", "Resumen ejecutivo"],
              ["motivo", "Por motivo"],
              ["hz", "Por Hunting Zone"],
              ["pivot", "Tabla dinámica"],
            ] as const
          ).map(([id, etiqueta]) => (
            <button
              key={id}
              type="button"
              className={`tab${tab === id ? " active" : ""}`}
              onClick={() => setTab(id)}
            >
              {etiqueta}
            </button>
          ))}
        </nav>

        {/* ---------------- RESUMEN ---------------- */}
        {(tab === "resumen" || imprimiendo) && (
          <section className="view">
            <div className="bench">
              <div className="bench-top">
                <div>
                  <div className="eyebrow-s" style={{ color: "#8FB4C9" }}>
                    Indicador de área
                  </div>
                  <h2>Benchmark de inversión en innovación</h2>
                  <div className="lead">
                    Gasto del área frente a las referencias de empresas con innovación
                    disruptiva. Ingrese el revenue y el plan de inversión para calibrar.
                  </div>
                </div>
                <div className="bench-scope">Alcance: {scopeText}</div>
              </div>

              <div className="bench-body">
                <div className="bench-inputs">
                  <label className="il" htmlFor="in-rev">
                    Revenue de EP (USD)
                  </label>
                  <div className="inp">
                    <span>$</span>
                    <input id="in-rev" inputMode="numeric" value={rev} onChange={montoInput(setRev)} />
                  </div>
                  {/* El campo sigue siendo manual: "Revenue de EP" es el
                      facturado de la empresa y los ingresos cargados son los de
                      los proyectos — pueden ser magnitudes distintas, así que
                      sustituirlo solo sería mentir. Esto es un atajo explícito. */}
                  {iTot > 0 && (
                    <button
                      type="button"
                      onClick={() => setRev(Math.round(iTot).toLocaleString("en-US"))}
                      className="no-print"
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        marginTop: 4,
                        font: "inherit",
                        fontSize: 11,
                        color: "#8FB4C9",
                        textDecoration: "underline",
                        cursor: "pointer",
                      }}
                    >
                      usar ingresos registrados ({fmtAbbr(iTot)})
                    </button>
                  )}
                  <label className="il" htmlFor="in-plan">
                    Plan de inversión EP (USD)
                  </label>
                  <div className="inp">
                    <span>$</span>
                    <input
                      id="in-plan"
                      inputMode="numeric"
                      value={planInv}
                      onChange={montoInput(setPlanInv)}
                    />
                  </div>
                  <div className="bench-hint">
                    La banda marca el rango de referencia sano. Para una lectura anual
                    limpia, seleccione un solo año en el período.
                  </div>
                </div>

                <div className="meters">
                  <Medidor
                    titulo="Gasto vs. Revenue"
                    referencia="Referencia: 3 %–5 % del revenue"
                    valor={pct(gTot, revNum)}
                    hay={revNum > 0}
                    banda={[3, 5]}
                    max={8}
                    escala={["0%", "3%", "5%", "8%+"]}
                    modo="rango"
                  />
                  <Medidor
                    titulo="Gasto vs. Plan de inversión EP"
                    referencia="Referencia: hasta 10 % del plan"
                    valor={pct(gTot, planNum)}
                    hay={planNum > 0}
                    banda={[0, 10]}
                    max={30}
                    escala={["0%", "10%", "20%", "30%+"]}
                    modo="techo"
                  />
                </div>
              </div>
            </div>

            <div className="kpis">
              <div className="kpi">
                <div className="kl">Total Gastos Acumulados ({periodo})</div>
                <div className="kv num">{fmtAbbr(gTot)}</div>
                <div className="kx">{fmtUSD(gTot)}</div>
              </div>
              <div className="kpi">
                <div className="kl">Gastos Año Fiscal Actual ({cur})</div>
                <div className="kv num">
                  {fmtAbbr(curTot)}
                  {deltaPct !== null && (
                    <span className={`pill ${deltaPct >= 0 ? "up" : "down"}`}>
                      {deltaPct >= 0 ? "▲ +" : "▼ "}
                      {deltaPct.toFixed(0)}% vs {prev}
                    </span>
                  )}
                </div>
                <div className="kx">
                  {projShown && (
                    <>
                      Proyección cierre FY:{" "}
                      <span className="proj">
                        {fmtAbbr(curTot * (12 / mesesTranscurridos))}
                      </span>{" "}
                      · run-rate {mesesTranscurridos} meses
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Bloque aparte y no dos cards más arriba: .kpis es una grilla de
                dos columnas, así que un 2-up nuevo entra sin tocar el CSS. */}
            {datos.ingresos.length > 0 && (
              <div className="kpis">
                <div className="kpi">
                  <div className="kl">Ingresos Acumulados ({periodo})</div>
                  <div className="kv num" style={{ color: "var(--ok)" }}>
                    {fmtAbbr(iTot)}
                  </div>
                  <div className="kx">{fmtUSD(iTot)}</div>
                </div>
                <div className="kpi">
                  <div className="kl">Resultado Neto ({periodo})</div>
                  <div
                    className="kv num"
                    style={{ color: netTot >= 0 ? "var(--ok)" : "var(--bad)" }}
                  >
                    {fmtAbbr(netTot)}
                  </div>
                  <div className="kx">
                    Ingresos {fmtUSD(iTot)} − gastos {fmtUSD(gTot)}
                  </div>
                </div>
              </div>
            )}

            <p className="note-nomina">
              <b>Nota:</b> el reporte no incluye los gastos de Nómina.
            </p>

            <div className="seg-bar">
              <span className="seg-label">Segmentar por</span>
              <div className="seg">
                <button
                  type="button"
                  className={seg === "fase" ? "on" : ""}
                  onClick={() => setSeg("fase")}
                >
                  Fase
                </button>
                <button
                  type="button"
                  className={seg === "hz" ? "on" : ""}
                  onClick={() => setSeg("hz")}
                >
                  Hunting Zone
                </button>
              </div>
            </div>

            <div className="grid-2">
              <div className="card">
                <div className="card-h">
                  <h3>Evolución del gasto por año fiscal</h3>
                  <span className="note">
                    {projShown
                      ? `Proy. FY ${datos.currentFY} (${mesesTranscurridos} m)`
                      : "Ejecutado"}
                  </span>
                </div>
                <div className="chart-box tall">
                  <canvas ref={refAnio} />
                </div>
              </div>
              <div className="card">
                <div className="card-h">
                  <h3>Composición del gasto</h3>
                  <span className="note">Acumulado del período</span>
                </div>
                <div className="chart-box tall">
                  <canvas ref={refComp} />
                </div>
              </div>
            </div>

            {/* A ancho completo y debajo del grid-2: ese grid es de dos
                columnas y un tercer hijo quedaría desbalanceado. */}
            {datos.ingresos.length > 0 && (
              <div className="card grid-1">
                <div className="card-h">
                  <h3>Ingresos vs. gastos por año fiscal</h3>
                  <span className="note">Neto = ingresos − gastos</span>
                </div>
                <div className="chart-box tall">
                  <canvas ref={refIngresos} />
                </div>
              </div>
            )}
          </section>
        )}

        {/* ---------------- MOTIVO ---------------- */}
        {(tab === "motivo" || imprimiendo) && (
          <section className="view">
            <div className="card grid-1">
              <div className="card-h">
                <h3>Gasto por motivo</h3>
                <span className="note">Top motivos del alcance filtrado</span>
              </div>
              <div className="chart-box tall">
                <canvas ref={refMotivo} />
              </div>
            </div>

            <div className="card">
              <div className="card-h">
                <h3>Detalle por motivo</h3>
                <button
                  type="button"
                  className="btn-toggle"
                  onClick={() =>
                    setMotAbiertos((prev) =>
                      prev.size === motivosOrdenados.length
                        ? new Set()
                        : new Set(motivosOrdenados.map((_, i) => i)),
                    )
                  }
                >
                  {motAbiertos.size === motivosOrdenados.length ? "Colapsar todo" : "Expandir todo"}
                </button>
              </div>

              <table className="mtable">
                <thead>
                  <tr>
                    <th>Motivo / Hunting Zone</th>
                    <th className="r">Gasto (USD)</th>
                    <th className="r">% part.</th>
                  </tr>
                </thead>
                <tbody>
                  {motivosOrdenados.map((m, i) => {
                    const o = byMotivo[m];
                    const maxM = byMotivo[motivosOrdenados[0]]?.monto || 1;
                    const abierto = motAbiertos.has(i);
                    const hzs = Object.entries(o.hz).sort((a, b) => b[1] - a[1]);

                    return (
                      <FragmentoMotivo
                        key={m}
                        motivo={m}
                        o={o}
                        i={i}
                        abierto={abierto}
                        maxM={maxM}
                        gtot={gTot}
                        hzs={hzs}
                        onToggle={() =>
                          setMotAbiertos((prev) => {
                            const c = new Set(prev);
                            if (c.has(i)) c.delete(i);
                            else c.add(i);
                            return c;
                          })
                        }
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ---------------- HZ ---------------- */}
        {(tab === "hz" || imprimiendo) && (
          <section className="view">
            <div className="card-h" style={{ marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 14 }}>Motivos principales de gasto por Hunting Zone</h3>
                <span className="note">
                  Top drivers por zona · abre el detalle (tabla dinámica) en cada tarjeta
                </span>
              </div>
            </div>

            <div className="hz-grid">
              {hzOrdenadas.length === 0 && (
                <div className="empty">Sin registros para el alcance seleccionado.</div>
              )}
              {hzOrdenadas.map((h) => {
                const o = byHz[h];
                const mots = Object.entries(o.mot)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5);
                const maxV = mots[0]?.[1] ?? 1;
                return (
                  <div className="card hz-card" key={h}>
                    <div className="hz-head">
                      <div>
                        <div className="hz-name">{h}</div>
                        <div className="hz-sub">
                          {Object.keys(o.mot).length} motivos de gasto
                        </div>
                      </div>
                      <div className="hz-total num">{fmtAbbr(o.monto)}</div>
                    </div>
                    <div className="hz-body">
                      {mots.map(([m, v], idx) => (
                        <div className="mbar" key={m}>
                          <div className="mb-h">
                            <span className="mb-n">{m}</span>
                            <span className="mb-v">
                              {fmtUSD(v)} · {pct(v, o.monto).toFixed(0)}%
                            </span>
                          </div>
                          <div className="mb-track">
                            <div
                              className="mb-fill"
                              style={{
                                width: `${(v / maxV) * 100}%`,
                                background: PALETTE[idx % PALETTE.length],
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="hz-detail-btn"
                      onClick={() => {
                        setHzModal(h);
                        setPmAbiertos(new Set(Object.keys(o.mot).map((_, i) => i)));
                      }}
                    >
                      Ver detalle (tabla dinámica) →
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ---------------- PIVOT ---------------- */}
        {(tab === "pivot" || imprimiendo) && (
          <section className="view">
            <div className="card-h" style={{ marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 14 }}>Tabla dinámica</h3>
                <span className="note">
                  Filas: HZ → Motivo → Detalle · Columnas: años fiscales · Subtotales por grupo
                </span>
              </div>
              <button
                type="button"
                className="btn-toggle"
                onClick={() => {
                  const ids: string[] = [];
                  Object.keys(arbol).forEach((h, hi) => {
                    ids.push("h" + hi);
                    Object.keys(arbol[h].mot).forEach((_, mi) => ids.push("h" + hi + "m" + mi));
                  });
                  setPivotExpandido((prev) =>
                    ids.every((id) => prev.has(id)) ? new Set() : new Set(ids),
                  );
                }}
              >
                Expandir / colapsar todo
              </button>
            </div>

            <TablaPivot
              arbol={arbol}
              years={selYears}
              expandido={pivotExpandido}
              onToggle={(id) =>
                setPivotExpandido((prev) => {
                  const c = new Set(prev);
                  if (c.has(id)) c.delete(id);
                  else c.add(id);
                  return c;
                })
              }
            />
          </section>
        )}

        <div className="foot">
          <span>
            Fuente: <b>Gastos IENN consolidado</b> · {datos.anios[0]}–
            {datos.anios[datos.anios.length - 1]} · USD · No incluye Nómina.
          </span>
          <span>Empresas Polar · IENN · Dashboard de seguimiento presupuestario</span>
        </div>
      </div>

      {hzModal && (
        <ModalHz
          hz={hzModal}
          rows={rows.filter((r) => r.hz === hzModal)}
          scope={scopeText}
          abiertos={pmAbiertos}
          onToggle={(i) =>
            setPmAbiertos((prev) => {
              const c = new Set(prev);
              if (c.has(i)) c.delete(i);
              else c.add(i);
              return c;
            })
          }
          onToggleTodos={(n) =>
            setPmAbiertos((prev) =>
              prev.size === n ? new Set() : new Set(Array.from({ length: n }, (_, i) => i)),
            )
          }
          onClose={() => setHzModal(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponentes
// ---------------------------------------------------------------------------

function Medidor({
  titulo,
  referencia,
  valor,
  hay,
  banda,
  max,
  escala,
  modo,
}: {
  titulo: string;
  referencia: string;
  valor: number;
  hay: boolean;
  banda: [number, number];
  max: number;
  escala: string[];
  modo: "rango" | "techo";
}) {
  const w = hay ? (Math.min(valor, max) / max) * 100 : 0;

  let cls = "";
  let txt = "";
  let col = "var(--muted)";
  if (hay) {
    if (modo === "techo") {
      if (valor <= banda[1]) [cls, txt, col] = ["ok", "En referencia", "var(--ok)"];
      else if (valor <= banda[1] * 1.5)
        [cls, txt, col] = ["warn", "Sobre referencia", "var(--warn)"];
      else [cls, txt, col] = ["bad", "Excede", "var(--bad)"];
    } else if (valor >= banda[0] && valor <= banda[1])
      [cls, txt, col] = ["ok", "En rango", "var(--ok)"];
    else if (valor < banda[0]) [cls, txt, col] = ["warn", "Bajo el rango", "var(--warn)"];
    else [cls, txt, col] = ["bad", "Sobre el rango", "var(--bad)"];
  }

  return (
    <div className="meter">
      <div className="mh">
        <div className="mt">
          {titulo}
          <small>{referencia}</small>
        </div>
        <div className="mv">
          <span className="pctval">{hay ? valor.toFixed(2) + "%" : "—"}</span>
          {hay && <span className={`chip ${cls}`}>{txt}</span>}
        </div>
      </div>
      <div className="track">
        <div
          className="band"
          style={{
            left: `${(banda[0] / max) * 100}%`,
            width: `${((banda[1] - banda[0]) / max) * 100}%`,
          }}
        />
        <div className="fill" style={{ width: `${w}%`, background: col }} />
        <div className="marker" style={{ left: `${w}%` }} />
      </div>
      <div className="scale">
        {escala.map((s) => (
          <span key={s}>{s}</span>
        ))}
      </div>
    </div>
  );
}

function FragmentoMotivo({
  motivo,
  o,
  i,
  abierto,
  maxM,
  gtot,
  hzs,
  onToggle,
}: {
  motivo: string;
  o: { monto: number };
  i: number;
  abierto: boolean;
  maxM: number;
  gtot: number;
  hzs: Array<[string, number]>;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className={`mrow${abierto ? " open" : ""}`} onClick={onToggle} data-i={i}>
        <td>
          <span className="caret">▶</span>
          {motivo}
          <div className="bar-mini" style={{ width: `${(o.monto / maxM) * 68}%` }} />
        </td>
        <td className="r num">{fmtUSD(o.monto)}</td>
        <td className="r num">{pct(o.monto, gtot).toFixed(1)}%</td>
      </tr>
      {abierto &&
        hzs.map(([h, hv]) => (
          <tr className="drow" key={h}>
            <td>{h}</td>
            <td className="r num">{fmtUSD(hv)}</td>
            <td className="r num">{pct(hv, o.monto).toFixed(1)}%</td>
          </tr>
        ))}
    </>
  );
}

interface NodoPivot {
  t: number;
  yr: Record<string, number>;
}

function TablaPivot({
  arbol,
  years,
  expandido,
  onToggle,
}: {
  arbol: Record<
    string,
    NodoPivot & {
      mot: Record<string, NodoPivot & { det: Record<string, NodoPivot> }>;
    }
  >;
  years: string[];
  expandido: Set<string>;
  onToggle: (id: string) => void;
}) {
  const hzs = Object.keys(arbol).sort((a, b) => arbol[b].t - arbol[a].t);
  const grand: NodoPivot = { t: 0, yr: {} };
  hzs.forEach((h) => {
    years.forEach((y) => (grand.yr[y] = (grand.yr[y] || 0) + (arbol[h].yr[y] || 0)));
    grand.t += arbol[h].t;
  });

  const celdas = (o: NodoPivot) => (
    <>
      {years.map((y) => (
        <td className="r num" key={y}>
          {o.yr[y] ? fmtAbbr(o.yr[y]) : <span className="z">–</span>}
        </td>
      ))}
      <td className="r num tot">{fmtAbbr(o.t)}</td>
    </>
  );

  return (
    <div className="pivot-wrap">
      <table className="pivot">
        <thead>
          <tr>
            <th className="rl">Hunting Zone / Motivo / Detalle</th>
            {years.map((y) => (
              <th className="r" key={y}>
                {y}
              </th>
            ))}
            <th className="r tot">Total</th>
          </tr>
        </thead>
        <tbody>
          {hzs.length === 0 && (
            <tr>
              <td className="empty" colSpan={years.length + 2}>
                Sin registros para el alcance seleccionado.
              </td>
            </tr>
          )}

          {hzs.map((h, hi) => {
            const H = arbol[h];
            const hid = "h" + hi;
            const hAbierto = expandido.has(hid);

            return (
              <FragmentoPivotHz
                key={h}
                h={h}
                H={H}
                hid={hid}
                hAbierto={hAbierto}
                expandido={expandido}
                onToggle={onToggle}
                celdas={celdas}
              />
            );
          })}

          {hzs.length > 0 && (
            <tr className="pv-total">
              <td className="rl">Total general</td>
              {years.map((y) => (
                <td className="r num" key={y}>
                  {fmtAbbr(grand.yr[y] || 0)}
                </td>
              ))}
              <td className="r num tot">{fmtAbbr(grand.t)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function FragmentoPivotHz({
  h,
  H,
  hid,
  hAbierto,
  expandido,
  onToggle,
  celdas,
}: {
  h: string;
  H: NodoPivot & { mot: Record<string, NodoPivot & { det: Record<string, NodoPivot> }> };
  hid: string;
  hAbierto: boolean;
  expandido: Set<string>;
  onToggle: (id: string) => void;
  celdas: (o: NodoPivot) => React.ReactNode;
}) {
  const motivos = Object.keys(H.mot).sort((a, b) => H.mot[b].t - H.mot[a].t);

  return (
    <>
      <tr className="pv-row lvl0">
        <td className="rl" onClick={() => onToggle(hid)}>
          <span
            className="pvcaret"
            style={{ transform: hAbierto ? "rotate(90deg)" : undefined }}
          >
            ▶
          </span>
          {h}
        </td>
        {celdas(H)}
      </tr>

      {hAbierto &&
        motivos.map((m, mi) => {
          const M = H.mot[m];
          const mid = hid + "m" + mi;
          const mAbierto = expandido.has(mid);
          const detalles = Object.keys(M.det).sort((a, b) => M.det[b].t - M.det[a].t);

          return (
            <Fragment key={mid}>
              <tr className="pv-row lvl1">
                <td className="rl" onClick={() => onToggle(mid)}>
                  <span
                    className="pvcaret"
                    style={{ transform: mAbierto ? "rotate(90deg)" : undefined }}
                  >
                    ▶
                  </span>
                  {m}
                </td>
                {celdas(M)}
              </tr>

              {mAbierto &&
                detalles.map((d) => (
                  <tr className="pv-row lvl2" key={mid + d}>
                    <td className="rl">{d}</td>
                    {celdas(M.det[d])}
                  </tr>
                ))}
            </Fragment>
          );
        })}
    </>
  );
}

function ModalHz({
  hz,
  rows,
  scope,
  abiertos,
  onToggle,
  onToggleTodos,
  onClose,
}: {
  hz: string;
  rows: RegistroDashboard[];
  scope: string;
  abiertos: Set<number>;
  onToggle: (i: number) => void;
  onToggleTodos: (n: number) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const tot = rows.reduce((s, r) => s + r.monto, 0);
  const byM: Record<string, { monto: number; det: Record<string, number> }> = {};
  rows.forEach((r) => {
    const o = (byM[r.motivo] = byM[r.motivo] || { monto: 0, det: {} });
    o.monto += r.monto;
    o.det[r.detalle] = (o.det[r.detalle] || 0) + r.monto;
  });
  const mots = Object.keys(byM).sort((a, b) => byM[b].monto - byM[a].monto);

  return (
    <div
      className="dash-modal-ov"
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle de ${hz}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dash-modal">
        <div className="modal-head">
          <div>
            <div className="mh-t">{hz}</div>
            <div className="mh-s">
              {fmtUSD(tot)} · {mots.length} motivos
            </div>
          </div>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>

        <div className="modal-tools">
          <span className="mt-info">Alcance: {scope}</span>
          <button
            type="button"
            className="btn-toggle"
            onClick={() => onToggleTodos(mots.length)}
          >
            {abiertos.size === mots.length ? "Colapsar todo" : "Expandir todo"}
          </button>
        </div>

        <div className="modal-body">
          <table className="pvt">
            <thead>
              <tr>
                <th>Motivo / Detalle</th>
                <th className="r">Gasto (USD)</th>
                <th className="r">% del HZ</th>
              </tr>
            </thead>
            <tbody>
              {mots.map((m, i) => {
                const o = byM[m];
                const dets = Object.entries(o.det).sort((a, b) => b[1] - a[1]);
                const abierto = abiertos.has(i);
                return (
                  <FragmentoModal
                    key={m}
                    motivo={m}
                    monto={o.monto}
                    tot={tot}
                    dets={dets}
                    abierto={abierto}
                    onToggle={() => onToggle(i)}
                  />
                );
              })}
              <tr className="ptot">
                <td>Total · {hz}</td>
                <td className="r num">{fmtUSD(tot)}</td>
                <td className="r num">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FragmentoModal({
  motivo,
  monto,
  tot,
  dets,
  abierto,
  onToggle,
}: {
  motivo: string;
  monto: number;
  tot: number;
  dets: Array<[string, number]>;
  abierto: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className={`pm${abierto ? " open" : ""}`} onClick={onToggle}>
        <td>
          <span className="pcaret">▶</span>
          {motivo}
        </td>
        <td className="r num">{fmtUSD(monto)}</td>
        <td className="r num">{pct(monto, tot).toFixed(1)}%</td>
      </tr>
      {abierto &&
        dets.map(([d, dv]) => (
          <tr className="pd" key={d}>
            <td>{d}</td>
            <td className="r num">{fmtUSD(dv)}</td>
            <td className="r num">{pct(dv, tot).toFixed(1)}%</td>
          </tr>
        ))}
    </>
  );
}
