-- ============================================================================
-- IENN Gastos App — Schema completo (Fase 2)
-- Fecha: 2026-08-04
-- Propósito: Modelo relacional para ingesta SAP, presupuestos manuales,
--            sala de triaje y rolling forecast (PRD Sección 3).
--
-- Convención de Año Fiscal (FY): el ciclo arranca en OCTUBRE.
--   FY 2025 == etiqueta "25/26" == Oct-2025 .. Sep-2026
--   (Verificado contra los archivos reales: "Q1 (26-27)" => Mes 2026-10-01,
--    y gastos de Abr-2023 etiquetados como "22/23" en el consolidado.)
--
-- Ejecutar completo sobre una base limpia. Es idempotente en lo posible.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 0. Tipos enumerados
-- ----------------------------------------------------------------------------

-- pendiente = en la Sala de Triaje | aprobado = cuenta en los KPIs
-- excluido  = papelera/archivado. SAP los trae en cada reporte pero no entran
--             en el control. Es reversible: se devuelven a pendiente desde la app.
do $$ begin
  create type public.estado_revision as enum ('pendiente', 'aprobado', 'excluido');
exception when duplicate_object then null; end $$;

do $$ begin
  -- De qué archivo de SAP proviene la fila (el mismo gasto puede existir en ambos).
  create type public.fuente_gasto as enum ('sap_ceco', 'sap_oi', 'manual');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Cómo se determinó la Hunting Zone del gasto (trazabilidad del triaje).
  create type public.origen_asignacion as enum (
    'orden_interna',   -- la OI venía en SAP y matcheó contra la maestra
    'prerregistro',    -- vino de una factura pre-registrada por finanzas
    'tag_texto',       -- se infirió leyendo un #TAG en el texto de referencia
    'manual',          -- el analista la asignó en la Sala de Triaje
    'sin_asignar'      -- gasto huérfano pendiente
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tipo_presupuesto as enum ('plan', 'extra_plan');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tipo_carga as enum (
    'sap_ceco', 'sap_oi', 'presupuesto_plan', 'presupuesto_extra_plan',
    'preregistro_facturas', 'maestras'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.estado_carga as enum ('procesando', 'completada', 'fallida');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 1. Funciones utilitarias
-- ----------------------------------------------------------------------------

-- Año fiscal (año de inicio del ciclo) a partir de una fecha. Oct..Dic => año actual.
create or replace function public.fy_de_fecha(p_fecha date)
returns smallint
language sql
immutable
strict
as $$
  select (
    extract(year from p_fecha)::int
    - case when extract(month from p_fecha)::int >= 10 then 0 else 1 end
  )::smallint;
$$;

comment on function public.fy_de_fecha(date) is
  'Año fiscal IENN (inicia en octubre). 2026-10-01 => 2026; 2026-09-30 => 2025.';

-- Etiqueta legible del FY, tal como la usan los reportes ("25/26").
create or replace function public.fy_etiqueta(p_fy smallint)
returns text
language sql
immutable
strict
as $$
  select lpad((p_fy % 100)::text, 2, '0') || '/' || lpad(((p_fy + 1) % 100)::text, 2, '0');
$$;

-- Mantiene updated_at en cada UPDATE.
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Tablas maestras
-- ----------------------------------------------------------------------------

-- 2.1 Centros de Costo -------------------------------------------------------
-- SAP exporta el CeCo como "DIVA/7190000026"; se persiste solo el código limpio.
create table if not exists public.cecos (
  id             uuid primary key default gen_random_uuid(),
  codigo_sap     text not null unique,
  nombre         text not null,
  usa_proyectos  boolean not null default true,
  activo         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint cecos_codigo_sap_no_vacio check (length(trim(codigo_sap)) > 0)
);

comment on column public.cecos.usa_proyectos is
  'Si es false, los gastos del CeCo no requieren Orden Interna y no entran a la Sala de Triaje.';

-- 2.2 Hunting Zones (Proyectos) ----------------------------------------------
create table if not exists public.hunting_zones (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null unique,
  tag_principal   text unique,          -- ej. '#CAM' — el tag canónico para mostrar en UI
  color_hex       text,                 -- para gráficos del dashboard
  orden_display   smallint not null default 100,
  activo          boolean not null default true,
  -- Si es true, la ingesta manda sus gastos directo a la papelera (excluido).
  -- Resuelve el caso "No Aplica": SAP los trae siempre y nunca entran al control.
  archivar_automatico boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint hz_tag_formato check (tag_principal is null or tag_principal like '#%'),
  constraint hz_color_formato check (color_hex is null or color_hex ~ '^#[0-9A-Fa-f]{6}$')
);

-- 2.3 Alias de tags ----------------------------------------------------------
-- La data real tiene varios tags apuntando a la misma HZ (#SNA e #IGC.SNA;
-- #CAM y #NEW.CAM), por eso el tag no puede vivir como columna única en
-- hunting_zones. Esta tabla es la que consulta el motor de inferencia del Flujo A.
create table if not exists public.hunting_zone_tags (
  id                uuid primary key default gen_random_uuid(),
  id_hunting_zone   uuid not null references public.hunting_zones(id) on delete cascade,
  tag               text not null unique,
  prioridad         smallint not null default 100,  -- menor gana si un texto trae 2 tags
  activo            boolean not null default true,
  created_at        timestamptz not null default now(),
  constraint hz_tags_formato check (tag like '#%')
);

create index if not exists idx_hz_tags_hz on public.hunting_zone_tags(id_hunting_zone);

-- 2.4 Órdenes Internas -------------------------------------------------------
-- codigo_oi es TEXT (no numérico): la data histórica mezcla códigos SAP
-- numéricos (9000100520) con códigos legacy alfanuméricos (IN24CAMPO, #MET).
create table if not exists public.ordenes_internas (
  id                uuid primary key default gen_random_uuid(),
  codigo_oi         text not null unique,
  nombre            text,
  id_ceco           uuid references public.cecos(id) on delete restrict,
  id_hunting_zone   uuid references public.hunting_zones(id) on delete restrict,
  fy                smallint,           -- FY al que pertenece la OI (null = vigente/multi-año)
  activo            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint oi_codigo_no_vacio check (length(trim(codigo_oi)) > 0),
  constraint oi_fy_rango check (fy is null or fy between 2015 and 2100)
);

create index if not exists idx_oi_ceco on public.ordenes_internas(id_ceco);
create index if not exists idx_oi_hz   on public.ordenes_internas(id_hunting_zone);
create index if not exists idx_oi_fy   on public.ordenes_internas(fy);

-- ----------------------------------------------------------------------------
-- 3. Auditoría de cargas (Flujos A y B)
-- ----------------------------------------------------------------------------

create table if not exists public.cargas (
  id                 uuid primary key default gen_random_uuid(),
  tipo               public.tipo_carga not null,
  nombre_archivo     text not null,
  hash_archivo       text,              -- sha256 del binario: evita re-subir el mismo archivo
  estado             public.estado_carga not null default 'procesando',
  filas_leidas       integer not null default 0,
  filas_insertadas   integer not null default 0,
  filas_duplicadas   integer not null default 0,
  filas_rechazadas   integer not null default 0,
  mensaje            text,
  id_usuario         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  finalizada_at      timestamptz
);

create index if not exists idx_cargas_tipo_fecha on public.cargas(tipo, created_at desc);

-- Filas que no pudieron procesarse. Sirve para la alerta del PRD §6:
-- "alertar si se carga un presupuesto a una OI que no existe en la maestra".
create table if not exists public.cargas_rechazos (
  id           uuid primary key default gen_random_uuid(),
  id_carga     uuid not null references public.cargas(id) on delete cascade,
  fila         integer,
  motivo       text not null,
  payload      jsonb,                   -- la fila cruda, para que el usuario la corrija
  created_at   timestamptz not null default now()
);

create index if not exists idx_rechazos_carga on public.cargas_rechazos(id_carga);

-- ----------------------------------------------------------------------------
-- 3.b Pre-registro de facturas (Flujo A, paso 4)
-- ----------------------------------------------------------------------------
-- Finanzas registra cada factura a medida que llega. Al cargar el reporte de
-- SAP, el cruce por NÚMERO DE FACTURA le aplica al gasto la OI y la taxonomía
-- ya definidas: es determinístico, no estadístico.
--
-- El monto NUNCA participa del cruce: la factura puede estar en Bs y SAP la
-- convierte a la tasa BCV del momento, así que nunca daría exacto. Se guarda
-- sólo para reportar el desvío.

create table if not exists public.facturas_preregistradas (
  id                 uuid primary key default gen_random_uuid(),

  numero_factura     text not null,
  -- Código SAP del acreedor: desempata facturas con el mismo número. Se
  -- prefiere al nombre porque no depende del tipeo y viene incluso en el
  -- reporte de CeCo, donde el nombre llega como "Sin asignar".
  proveedor_codigo   text,
  proveedor          text,
  texto_referencia   text,
  fecha_factura      date,

  id_oi              uuid references public.ordenes_internas(id) on delete set null,
  id_hunting_zone    uuid references public.hunting_zones(id) on delete set null,
  fase               text,
  motivo             text,
  detalle            text,

  monto_estimado     numeric(14, 2),
  moneda             text not null default 'USD',

  nota               text,
  activo             boolean not null default true,
  id_carga           uuid references public.cargas(id) on delete set null,
  creado_por         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint fp_numero_no_vacio check (length(trim(numero_factura)) > 0),
  constraint fp_moneda_valida   check (moneda in ('USD', 'VES')),

  -- Clave de cruce: SAP emite los números con ceros a la izquierda y en
  -- formatos mixtos ("0000019441", "000027", "A0250", "INV2398974").
  -- Espejo exacto de normalizarNumeroFactura() en src/lib/sap/normalizar.ts.
  numero_normalizado text generated always as (
    nullif(ltrim(upper(replace(trim(numero_factura), ' ', '')), '0'), '')
  ) stored
);

create index if not exists idx_fp_numero on public.facturas_preregistradas(numero_normalizado);
create index if not exists idx_fp_oi     on public.facturas_preregistradas(id_oi);
create index if not exists idx_fp_activo on public.facturas_preregistradas(activo) where activo;
create index if not exists idx_fp_proveedor_codigo on public.facturas_preregistradas(proveedor_codigo);

comment on column public.facturas_preregistradas.monto_estimado is
  'Informativo. No participa del cruce: la factura puede venir en Bs y SAP la convierte a tasa BCV.';

-- ----------------------------------------------------------------------------
-- 4. Gastos (transaccional)
-- ----------------------------------------------------------------------------

create table if not exists public.gastos (
  id                    uuid primary key default gen_random_uuid(),

  -- ---- Data SAP inmutable (PRD §6: nunca se borra ni se edita) -------------
  fuente                public.fuente_gasto not null,
  factura               text,
  fecha_documento       date not null,
  proveedor_codigo      text,            -- "CR/74277" -> 74277
  proveedor             text,
  texto_referencia      text,            -- crucial para la inferencia de #TAG
  grupo_clase_coste     text,
  ceco_codigo_raw       text,            -- tal cual vino de SAP ("DIVA/7190000026")
  oi_codigo_raw         text,            -- '#' cuando el gasto es huérfano
  monto_real            numeric(14, 2) not null,   -- columna "Real (USD2)"
  monto_plan_sap        numeric(14, 2),            -- columna "Plan (USD2)" de SAP (informativa)
  monto_comprometido    numeric(14, 2),

  -- ---- Data mutable (asignada por la app) ---------------------------------
  id_ceco               uuid references public.cecos(id) on delete restrict,
  id_oi                 uuid references public.ordenes_internas(id) on delete restrict,
  id_hunting_zone       uuid references public.hunting_zones(id) on delete restrict,
  -- Taxonomía: TRES CAMPOS INDEPENDIENTES de texto libre. No es un catálogo
  -- cerrado de combinaciones; la UI sugiere los valores ya usados
  -- (v_valores_taxonomia) para evitar errores de tipeo al agrupar.
  fase                  text,
  motivo                text,
  detalle               text,
  id_factura_preregistrada uuid
    references public.facturas_preregistradas(id) on delete set null,
  origen_hz             public.origen_asignacion not null default 'sin_asignar',
  estado_revision       public.estado_revision not null default 'pendiente',
  nota                  text,

  -- ---- Derivados y trazabilidad -------------------------------------------
  fy   smallint generated always as (public.fy_de_fecha(fecha_documento)) stored,
  mes  smallint generated always as (extract(month from fecha_documento)::smallint) stored,

  -- Clave de cruce contra facturas_preregistradas.numero_normalizado.
  factura_normalizada text generated always as (
    nullif(ltrim(upper(replace(trim(factura), ' ', '')), '0'), '')
  ) stored,

  -- Clave de deduplicación: replica el "Check Duplicados" del consolidado
  -- manual. No incluye la fuente a propósito — un mismo gasto exportado en el
  -- archivo de CeCo y en el de OI debe colapsar en una sola fila.
  -- Nota: una columna generada exige expresiones IMMUTABLE. `fecha::text` y
  -- `numeric::text` dependen de GUCs (DateStyle / locale), así que la fecha se
  -- serializa como días-epoch y el monto como centavos enteros.
  hash_dedupe text generated always as (
    md5(
      coalesce(upper(trim(proveedor)), '')        || '|' ||
      coalesce(trim(factura), '')                 || '|' ||
      coalesce(upper(trim(texto_referencia)), '') || '|' ||
      (fecha_documento - date '1970-01-01')::text || '|' ||
      (monto_real * 100)::bigint::text
    )
  ) stored,

  id_carga    uuid references public.cargas(id) on delete set null,
  revisado_por uuid references auth.users(id) on delete set null,
  revisado_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists uq_gastos_hash on public.gastos(hash_dedupe);
create index if not exists idx_gastos_fecha   on public.gastos(fecha_documento desc);
create index if not exists idx_gastos_fy_mes  on public.gastos(fy, mes);
create index if not exists idx_gastos_estado  on public.gastos(estado_revision) where estado_revision = 'pendiente';
create index if not exists idx_gastos_estado_todos on public.gastos(estado_revision);
create index if not exists idx_gastos_hz      on public.gastos(id_hunting_zone);
create index if not exists idx_gastos_oi      on public.gastos(id_oi);
create index if not exists idx_gastos_ceco    on public.gastos(id_ceco);
create index if not exists idx_gastos_carga   on public.gastos(id_carga);
create index if not exists idx_gastos_factura_norm   on public.gastos(factura_normalizada);
create index if not exists idx_gastos_factura_prereg on public.gastos(id_factura_preregistrada);
create index if not exists idx_gastos_fase    on public.gastos(fase);
create index if not exists idx_gastos_motivo  on public.gastos(motivo);
create index if not exists idx_gastos_detalle on public.gastos(detalle);

comment on column public.gastos.monto_real is
  'Derivado de la columna SAP "Monto (USD2)". SAP exporta en locale es-VE ("4.897,55"): el parser normaliza antes de insertar.';

-- Sella la data inmutable de SAP: la app solo puede tocar las columnas mutables.
create or replace function public.tg_gastos_proteger_sap()
returns trigger
language plpgsql
as $$
begin
  if new.factura is distinct from old.factura
     or new.fecha_documento is distinct from old.fecha_documento
     or new.proveedor is distinct from old.proveedor
     or new.texto_referencia is distinct from old.texto_referencia
     or new.monto_real is distinct from old.monto_real
     or new.fuente is distinct from old.fuente then
    raise exception 'Los campos de origen SAP son inmutables (gasto %)', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_gastos_proteger_sap on public.gastos;
create trigger trg_gastos_proteger_sap
  before update on public.gastos
  for each row execute function public.tg_gastos_proteger_sap();

-- ----------------------------------------------------------------------------
-- 5. Presupuestos (Flujo B — carga manual)
-- ----------------------------------------------------------------------------
-- Se persiste a nivel de LÍNEA (no agregado por mes) porque los formatos reales
-- traen detalle por cuenta contable, tipo de gasto y responsable. La forma
-- agregada que describe el PRD (monto_plan / monto_suplemento_extra_plan por
-- OI-mes-FY) se expone en la vista v_presupuesto_oi_mes más abajo.

create table if not exists public.presupuestos (
  id                  uuid primary key default gen_random_uuid(),
  id_oi               uuid not null references public.ordenes_internas(id) on delete restrict,
  tipo                public.tipo_presupuesto not null,
  fy                  smallint not null,
  mes                 smallint not null,
  quarter             text,              -- "Q1 (26-27)" / "Q-03" tal como viene del Excel
  monto               numeric(14, 2) not null,

  -- Detalle informativo del formato estándar
  cuenta_contable     text,
  descripcion_cuenta  text,
  tipo_gasto          text,
  detalle_gasto       text,
  responsable         text,
  area                text,
  ceco_declarado      text,              -- lo que dice el Excel; la verdad es ordenes_internas.id_ceco

  id_carga            uuid references public.cargas(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint presupuestos_mes_rango check (mes between 1 and 12),
  constraint presupuestos_fy_rango  check (fy between 2015 and 2100)
);

create index if not exists idx_presu_oi_periodo on public.presupuestos(id_oi, fy, mes);
create index if not exists idx_presu_fy_mes     on public.presupuestos(fy, mes);
create index if not exists idx_presu_tipo       on public.presupuestos(tipo);
create index if not exists idx_presu_carga      on public.presupuestos(id_carga);

-- ----------------------------------------------------------------------------
-- 6. Triggers de updated_at
-- ----------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'cecos', 'hunting_zones', 'ordenes_internas', 'gastos', 'presupuestos',
    'facturas_preregistradas'
  ] loop
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$s', t);
    execute format(
      'create trigger trg_%1$s_updated_at before update on public.%1$s
         for each row execute function public.tg_set_updated_at()', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 7. Vistas de consolidación
-- ----------------------------------------------------------------------------

-- 7.1 Presupuesto en la forma que describe el PRD §3.5, ya resuelto a CeCo y HZ
-- vía la maestra de Órdenes Internas (Flujo B, paso 3).
create or replace view public.v_presupuesto_oi_mes as
select
  p.id_oi,
  oi.codigo_oi,
  oi.id_ceco,
  oi.id_hunting_zone,
  p.fy,
  public.fy_etiqueta(p.fy)                                            as fy_etiqueta,
  p.mes,
  sum(p.monto) filter (where p.tipo = 'plan')                         as monto_plan,
  sum(p.monto) filter (where p.tipo = 'extra_plan')                   as monto_suplemento_extra_plan,
  sum(p.monto)                                                        as monto_total
from public.presupuestos p
join public.ordenes_internas oi on oi.id = p.id_oi
group by p.id_oi, oi.codigo_oi, oi.id_ceco, oi.id_hunting_zone, p.fy, p.mes;

-- 7.2 Gastos enriquecidos: una sola fuente para dashboard, triaje y exportes.
create or replace view public.v_gastos_enriquecidos as
select
  g.id,
  g.fecha_documento,
  g.fy,
  public.fy_etiqueta(g.fy) as fy_etiqueta,
  g.mes,
  g.factura,
  g.proveedor,
  g.texto_referencia,
  g.grupo_clase_coste,
  g.monto_real,
  g.estado_revision,
  g.origen_hz,
  g.nota,
  g.id_ceco,
  g.id_oi,
  g.id_hunting_zone,
  g.oi_codigo_raw,
  g.ceco_codigo_raw,
  g.proveedor_codigo,
  g.id_factura_preregistrada,
  fp.numero_factura as factura_preregistrada,
  c.codigo_sap  as ceco_codigo,
  c.nombre      as ceco_nombre,
  oi.codigo_oi,
  oi.nombre     as oi_nombre,
  hz.nombre     as hunting_zone,
  hz.tag_principal,
  g.fase,
  g.motivo,
  g.detalle
from public.gastos g
left join public.cecos c             on c.id  = g.id_ceco
left join public.ordenes_internas oi on oi.id = g.id_oi
left join public.hunting_zones hz    on hz.id = g.id_hunting_zone
left join public.facturas_preregistradas fp on fp.id = g.id_factura_preregistrada;

-- 7.2.b Valores ya usados en la taxonomía, para el autocompletado de la UI.
create or replace view public.v_valores_taxonomia as
with valores as (
  select 'fase' as campo, fase as valor from public.gastos where fase is not null
  union all select 'motivo',  motivo  from public.gastos where motivo is not null
  union all select 'detalle', detalle from public.gastos where detalle is not null
  union all select 'fase',    fase    from public.facturas_preregistradas where fase is not null
  union all select 'motivo',  motivo  from public.facturas_preregistradas where motivo is not null
  union all select 'detalle', detalle from public.facturas_preregistradas where detalle is not null
)
select campo, valor, count(*) as usos
from valores
group by campo, valor
order by campo, count(*) desc, valor;

alter view public.v_valores_taxonomia set (security_invoker = on);

-- 7.3 Real vs Plan por HZ / FY / mes — insumo directo del Rolling Forecast (Flujo D).
-- El real se expone ABIERTO POR ESTADO: la vista no decide la política de KPI,
-- la decide el dashboard. Los archivados (excluido) quedan siempre fuera.
create or replace view public.v_ejecucion_mensual_hz as
with real as (
  select
    g.id_hunting_zone,
    g.fy,
    g.mes,
    coalesce(sum(g.monto_real) filter (where g.estado_revision = 'aprobado'), 0)  as real_aprobado,
    coalesce(sum(g.monto_real) filter (where g.estado_revision = 'pendiente'), 0) as real_pendiente,
    coalesce(sum(g.monto_real), 0)                                               as real_total
  from public.gastos g
  where g.estado_revision <> 'excluido'
  group by 1, 2, 3
),
plan as (
  select v.id_hunting_zone, v.fy, v.mes,
         sum(coalesce(v.monto_plan, 0))                    as plan,
         sum(coalesce(v.monto_suplemento_extra_plan, 0))   as extra_plan
  from public.v_presupuesto_oi_mes v
  group by 1, 2, 3
)
select
  coalesce(r.id_hunting_zone, p.id_hunting_zone)      as id_hunting_zone,
  coalesce(r.fy, p.fy)                                as fy,
  coalesce(r.mes, p.mes)                              as mes,
  coalesce(r.real_aprobado, 0)                        as monto_real_aprobado,
  coalesce(r.real_pendiente, 0)                       as monto_real_pendiente,
  coalesce(r.real_total, 0)                           as monto_real,
  coalesce(p.plan, 0)                                 as monto_plan,
  coalesce(p.extra_plan, 0)                           as monto_extra_plan,
  coalesce(p.plan, 0) + coalesce(p.extra_plan, 0)     as presupuesto_total,
  coalesce(p.plan, 0) + coalesce(p.extra_plan, 0) - coalesce(r.real_total, 0) as desviacion
from real r
full outer join plan p
  on p.id_hunting_zone is not distinct from r.id_hunting_zone
 and p.fy = r.fy and p.mes = r.mes;

-- 7.4 Conciliación de facturas pre-registradas contra lo que trajo SAP.
-- Una misma factura puede tener varias posiciones en SAP, por eso se agrega.
create or replace view public.v_conciliacion_facturas as
select
  fp.id                          as id_factura_preregistrada,
  fp.numero_factura,
  fp.numero_normalizado,
  fp.proveedor_codigo,
  fp.proveedor,
  fp.fecha_factura,
  fp.monto_estimado,
  fp.moneda,
  count(g.id)                    as posiciones_sap,
  coalesce(sum(g.monto_real), 0) as monto_real_sap,
  -- El desvío solo tiene sentido si el estimado ya estaba en USD.
  case
    when fp.monto_estimado is null or fp.moneda <> 'USD' then null
    else round(coalesce(sum(g.monto_real), 0) - fp.monto_estimado, 2)
  end                            as desvio_usd,
  bool_or(g.id is not null)      as conciliada
from public.facturas_preregistradas fp
left join public.gastos g on g.id_factura_preregistrada = fp.id
where fp.activo
group by fp.id, fp.numero_factura, fp.numero_normalizado, fp.proveedor_codigo,
         fp.proveedor, fp.fecha_factura, fp.monto_estimado, fp.moneda;

alter view public.v_conciliacion_facturas set (security_invoker = on);

-- ----------------------------------------------------------------------------
-- 8. Row Level Security
-- ----------------------------------------------------------------------------
-- App interna: NO hay lectura pública. Toda la data financiera exige sesión.

alter table public.cecos              enable row level security;
alter table public.hunting_zones      enable row level security;
alter table public.hunting_zone_tags  enable row level security;
alter table public.ordenes_internas   enable row level security;
alter table public.cargas             enable row level security;
alter table public.cargas_rechazos    enable row level security;
alter table public.gastos             enable row level security;
alter table public.presupuestos       enable row level security;
alter table public.facturas_preregistradas enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'cecos', 'hunting_zones', 'hunting_zone_tags', 'ordenes_internas',
    'cargas', 'cargas_rechazos', 'gastos', 'presupuestos',
    'facturas_preregistradas'
  ] loop
    execute format('drop policy if exists "acceso_autenticado" on public.%I', t);
    execute format(
      'create policy "acceso_autenticado" on public.%I
         for all to authenticated
         using (true) with check (true)', t);
  end loop;
end $$;

-- Las vistas heredan el RLS de sus tablas base (security_invoker).
alter view public.v_presupuesto_oi_mes     set (security_invoker = on);
alter view public.v_gastos_enriquecidos    set (security_invoker = on);
alter view public.v_ejecucion_mensual_hz   set (security_invoker = on);
alter view public.v_conciliacion_facturas   set (security_invoker = on);

-- ----------------------------------------------------------------------------
-- 9. Hardening de funciones
-- ----------------------------------------------------------------------------
-- Sin search_path fijo, un rol podría anteponer un esquema propio y secuestrar
-- una llamada no calificada (Supabase linter 0011). Todas estas funciones usan
-- solo built-ins de pg_catalog, así que un search_path vacío es seguro.

alter function public.fy_de_fecha(date)          set search_path = '';
alter function public.fy_etiqueta(smallint)      set search_path = '';
alter function public.tg_set_updated_at()        set search_path = '';
alter function public.tg_gastos_proteger_sap()   set search_path = '';

-- ============================================================================
-- Fin del schema. Los catálogos maestros se cargan con supabase/seed.sql
-- ============================================================================
