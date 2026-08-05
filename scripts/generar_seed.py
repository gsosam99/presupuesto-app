"""Genera supabase/seed.sql a partir de los archivos fuente de la Fase 1.

Uso:
    python3 scripts/generar_seed.py

Requiere pandas + openpyxl. Reejecutar cuando llegue el consolidado completo
de la Fase 1 (la muestra actual solo trae 48 filas, por lo que la taxonomía
Fase > Motivo > Detalle sale incompleta).
"""
import re
import pandas as pd

DESK = "/Users/guillermososa/Desktop"
SEED = f"{DESK}/Muestra_Seed_Consolidado_21-26.xlsx"
OUT = f"{DESK}/presupuesto-app/supabase/seed.sql"


def q(v):
    if v is None or (isinstance(v, float) and pd.isna(v)) or str(v).strip() in ("", "nan"):
        return "null"
    return "'" + str(v).strip().replace("'", "''") + "'"


mapa = pd.read_excel(SEED, sheet_name="Ordenes Internas", header=0)
mapa.columns = ["codigo", "hz"]
mapa = mapa.dropna()
mapa["codigo"] = mapa["codigo"].astype(str).str.strip()
mapa["hz"] = mapa["hz"].astype(str).str.strip()

cons = pd.read_excel(SEED, sheet_name="CONSOLIDADO", header=0)


def norm_codigo(c):
    # 9000100520.0 -> 9000100520
    return re.sub(r"\.0$", "", str(c).strip())


cons["Orden Interna"] = cons["Orden Interna"].map(norm_codigo)
cons["CeCo"] = cons["CeCo"].map(lambda c: None if pd.isna(c) else norm_codigo(c))

# ---- Hunting Zones ---------------------------------------------------------
EXCLUIR_HZ = {"(sin asignar)"}
hz_nombres = sorted({h for h in mapa["hz"] if h not in EXCLUIR_HZ})

# tag principal = el tag mas corto asociado a la HZ
tags = mapa[mapa["codigo"].str.startswith("#") & (mapa["codigo"] != "#")]
tag_por_hz = {}
for hz, grupo in tags.groupby("hz"):
    if hz in EXCLUIR_HZ:
        continue
    tag_por_hz[hz] = sorted(grupo["codigo"], key=lambda t: (len(t), t))[0]

PALETA = [
    "#0F766E", "#B45309", "#1D4ED8", "#BE123C", "#4D7C0F", "#7C3AED",
    "#0891B2", "#C2410C", "#4338CA", "#A16207", "#15803D", "#9333EA",
    "#0E7490", "#DB2777",
]

# ---- CeCos (evidencia de los archivos reales) ------------------------------
cecos = [
    ("7190000026", "Innovación y Nuevos Negocios", True),
    ("7330000000", "Innovación - Consultoría y Método", True),
]

# ---- CeCo por OI -----------------------------------------------------------
ceco_por_oi = {}
for _, r in cons.dropna(subset=["CeCo"]).iterrows():
    oi = r["Orden Interna"]
    if oi and oi != "nan":
        ceco_por_oi[oi] = r["CeCo"]

for archivo in [
    "Formato - Presupuesto Planificado Método y Consultoría.xlsx",
    "Formato - Extra Plan Polar en el Campo.xlsx",
]:
    d = pd.read_excel(f"{DESK}/{archivo}", header=0)
    col_oi = "Nueva Orden"
    col_ceco = "Centro de Costo"
    if col_oi in d.columns and col_ceco in d.columns:
        for _, r in d.dropna(subset=[col_oi]).iterrows():
            oi = norm_codigo(r[col_oi])
            ceco = r[col_ceco]
            if pd.notna(ceco):
                ceco_por_oi.setdefault(oi, norm_codigo(ceco))

# ---- Nombre por OI ---------------------------------------------------------
nombre_por_oi = {}
for _, r in cons.iterrows():
    oi = r["Orden Interna"]
    nom = r.get("Nombre Orden Interna")
    if oi and oi != "nan" and pd.notna(nom):
        nombre_por_oi.setdefault(oi, str(nom).strip())


def fy_de_codigo(c):
    m = re.match(r"^(?:IN|PG)(\d{2})", c)
    return 2000 + int(m.group(1)) if m else None


# ---- Taxonomia -------------------------------------------------------------
tax = (
    cons[["Fase", "Motivo", "Detalle"]]
    .dropna()
    .drop_duplicates()
    .sort_values(["Fase", "Motivo", "Detalle"])
)

L = []
w = L.append
w("-- ============================================================================")
w("-- IENN Gastos App — Seed de tablas maestras")
w("-- Fecha: 2026-08-04")
w("-- Generado a partir de: Muestra_Seed_Consolidado_21-26.xlsx (hojas 'Ordenes")
w("-- Internas' y 'CONSOLIDADO') y de los formatos de presupuesto Plan/Extra Plan.")
w("-- Idempotente: se puede re-ejecutar sin duplicar filas.")
w("-- ============================================================================")
w("")
w("-- ---------------------------------------------------------------------------")
w("-- 1. Centros de Costo")
w("-- ---------------------------------------------------------------------------")
w("insert into public.cecos (codigo_sap, nombre, usa_proyectos) values")
w(
    ",\n".join(
        f"  ({q(c)}, {q(n)}, {str(u).lower()})" for c, n, u in cecos
    )
    + "\non conflict (codigo_sap) do update set nombre = excluded.nombre;"
)
w("")
w("-- ---------------------------------------------------------------------------")
w("-- 2. Hunting Zones")
w("-- ---------------------------------------------------------------------------")
w("insert into public.hunting_zones (nombre, tag_principal, color_hex, orden_display) values")
filas = []
for i, hz in enumerate(hz_nombres):
    filas.append(
        f"  ({q(hz)}, {q(tag_por_hz.get(hz))}, {q(PALETA[i % len(PALETA)])}, {(i + 1) * 10})"
    )
w(",\n".join(filas) + "\non conflict (nombre) do update set")
w("  tag_principal = excluded.tag_principal,")
w("  color_hex     = excluded.color_hex;")
w("")
w("-- ---------------------------------------------------------------------------")
w("-- 3. Alias de tags -> Hunting Zone (motor de inferencia del Flujo A)")
w("-- ---------------------------------------------------------------------------")
w("insert into public.hunting_zone_tags (id_hunting_zone, tag, prioridad)")
w("select hz.id, v.tag, v.prioridad")
w("from (values")
filas = []
for _, r in tags.iterrows():
    if r["hz"] in EXCLUIR_HZ:
        continue
    # tags mas especificos (mas largos) se evaluan primero
    prioridad = 100 - len(r["codigo"])
    filas.append(f"  ({q(r['codigo'])}, {q(r['hz'])}, {prioridad})")
w(",\n".join(sorted(set(filas))))
w(") as v(tag, hz_nombre, prioridad)")
w("join public.hunting_zones hz on hz.nombre = v.hz_nombre")
w("on conflict (tag) do update set")
w("  id_hunting_zone = excluded.id_hunting_zone,")
w("  prioridad       = excluded.prioridad;")
w("")
w("-- ---------------------------------------------------------------------------")
w("-- 4. Órdenes Internas")
w("--    codigo_oi es TEXT: convive el código SAP numérico con el legacy")
w("--    alfanumérico (IN24CAMPO) y con los tags manuales (#MET) del histórico.")
w("-- ---------------------------------------------------------------------------")
w("insert into public.ordenes_internas (codigo_oi, nombre, id_ceco, id_hunting_zone, fy)")
w("select v.codigo_oi, v.nombre, c.id, hz.id, v.fy")
w("from (values")
filas = []
for _, r in mapa.iterrows():
    codigo = r["codigo"]
    if codigo == "#" or r["hz"] in EXCLUIR_HZ:
        continue
    nombre = nombre_por_oi.get(codigo, r["hz"])
    ceco = ceco_por_oi.get(codigo)
    fy = fy_de_codigo(codigo)
    filas.append(
        f"  ({q(codigo)}, {q(nombre)}, {q(ceco)}, {q(r['hz'])}, "
        f"{fy if fy else 'null'}::smallint)"
    )
w(",\n".join(filas))
w(") as v(codigo_oi, nombre, ceco_codigo, hz_nombre, fy)")
w("left join public.cecos c          on c.codigo_sap = v.ceco_codigo")
w("join      public.hunting_zones hz on hz.nombre    = v.hz_nombre")
w("on conflict (codigo_oi) do update set")
w("  nombre          = excluded.nombre,")
w("  id_ceco         = coalesce(excluded.id_ceco, ordenes_internas.id_ceco),")
w("  id_hunting_zone = excluded.id_hunting_zone;")
w("")
w("-- ---------------------------------------------------------------------------")
w("-- 5. Taxonomía oficial (Fase > Motivo > Detalle) — resultado de la Fase 1")
w("-- ---------------------------------------------------------------------------")
w("insert into public.taxonomias (fase, motivo, detalle) values")
filas = [
    f"  ({q(r['Fase'])}, {q(r['Motivo'])}, {q(r['Detalle'])})" for _, r in tax.iterrows()
]
w(",\n".join(filas) + "\non conflict (fase, motivo, detalle) do nothing;")
w("")

open(OUT, "w").write("\n".join(L))
print("OK ->", OUT)
print("HZ:", len(hz_nombres), "| tags:", len(tags), "| OIs:", len(mapa) - 1, "| taxonomías:", len(tax))
