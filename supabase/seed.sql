-- ============================================================================
-- ⚠️  NO EJECUTAR TAL CUAL — DERIVADO DE ARCHIVOS DUMMY
--
-- Este seed se generó a partir de los Excel de referencia, cuya DATA es dummy
-- (solo la ESTRUCTURA es real). NO se aplicó a la base.
--
-- Las maestras reales (CeCos, Hunting Zones, tags, OIs y taxonomía) las deriva
-- automáticamente scripts/importar_consolidado.ts desde el consolidado oficial
-- de Fase 1. Este archivo queda como referencia de la forma esperada.
-- ============================================================================
--
-- IENN Gastos App — Seed de tablas maestras
-- Fecha: 2026-08-04
-- Generado a partir de: Muestra_Seed_Consolidado_21-26.xlsx (hojas 'Ordenes
-- Internas' y 'CONSOLIDADO') y de los formatos de presupuesto Plan/Extra Plan.
-- Idempotente: se puede re-ejecutar sin duplicar filas.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Centros de Costo
-- ---------------------------------------------------------------------------
insert into public.cecos (codigo_sap, nombre, usa_proyectos) values
  ('7190000026', 'Innovación y Nuevos Negocios', true),
  ('7330000000', 'Innovación - Consultoría y Método', true)
on conflict (codigo_sap) do update set nombre = excluded.nombre;

-- ---------------------------------------------------------------------------
-- 2. Hunting Zones
-- ---------------------------------------------------------------------------
insert into public.hunting_zones (nombre, tag_principal, color_hex, orden_display) values
  ('Ambición', '#AMB', '#0F766E', 10),
  ('Cultura Externa', '#CUL.EXT', '#B45309', 20),
  ('Cultura Interna', '#CUL.INT', '#1D4ED8', 30),
  ('Heritage', null, '#BE123C', 40),
  ('Marketplace', null, '#4D7C0F', 50),
  ('Método y Consultoría', '#MET', '#7C3AED', 60),
  ('No Aplica', '#NO APLICA', '#0891B2', 70),
  ('Nutrición', '#NUT', '#C2410C', 80),
  ('Planificación Estratégica', '#PLANIF.EST', '#4338CA', 90),
  ('Polar en el Campo', '#CAM', '#A16207', 100),
  ('Snacks USA', '#SNA', '#15803D', 110),
  ('Transformación Empresas Polar', '#TRANS.EP', '#9333EA', 120),
  ('Viajes', null, '#0E7490', 130)
on conflict (nombre) do update set
  tag_principal = excluded.tag_principal,
  color_hex     = excluded.color_hex;

-- ---------------------------------------------------------------------------
-- 3. Alias de tags -> Hunting Zone (motor de inferencia del Flujo A)
-- ---------------------------------------------------------------------------
insert into public.hunting_zone_tags (id_hunting_zone, tag, prioridad)
select hz.id, v.tag, v.prioridad
from (values
  ('#AMB', 'Ambición', 96),
  ('#CAM', 'Polar en el Campo', 96),
  ('#CUL.EXT', 'Cultura Externa', 92),
  ('#CUL.INT', 'Cultura Interna', 92),
  ('#IGC.SNA', 'Snacks USA', 92),
  ('#MET', 'Método y Consultoría', 96),
  ('#NEW.CAM', 'Polar en el Campo', 92),
  ('#NO APLICA', 'No Aplica', 90),
  ('#NUT', 'Nutrición', 96),
  ('#PLANIF.EST', 'Planificación Estratégica', 89),
  ('#SNA', 'Snacks USA', 96),
  ('#TRANS.EP', 'Transformación Empresas Polar', 91)
) as v(tag, hz_nombre, prioridad)
join public.hunting_zones hz on hz.nombre = v.hz_nombre
on conflict (tag) do update set
  id_hunting_zone = excluded.id_hunting_zone,
  prioridad       = excluded.prioridad;

-- ---------------------------------------------------------------------------
-- 4. Órdenes Internas
--    codigo_oi es TEXT: convive el código SAP numérico con el legacy
--    alfanumérico (IN24CAMPO) y con los tags manuales (#MET) del histórico.
-- ---------------------------------------------------------------------------
insert into public.ordenes_internas (codigo_oi, nombre, id_ceco, id_hunting_zone, fy)
select v.codigo_oi, v.nombre, c.id, hz.id, v.fy
from (values
  ('IN24MKTPLACE', 'Marketplace', null, 'Marketplace', 2024::smallint),
  ('IN24CAMPO', 'Polar en el Campo', '7190000026', 'Polar en el Campo', 2024::smallint),
  ('IN24CULTURAL', 'Cultura Externa', null, 'Cultura Externa', 2024::smallint),
  ('IN24COMIMAIZ', 'Snacks USA', null, 'Snacks USA', 2024::smallint),
  ('PG24AGRIREGE', 'Polar en el Campo', null, 'Polar en el Campo', 2024::smallint),
  ('IN24METODO', 'Método y Consultoría', '7190000026', 'Método y Consultoría', 2024::smallint),
  ('IN24AMBICION', 'Ambición', null, 'Ambición', 2024::smallint),
  ('IN24CULTINT', 'Cultura Interna', null, 'Cultura Interna', 2024::smallint),
  ('IN24HERITAGE', 'Heritage', null, 'Heritage', 2024::smallint),
  ('IN24NUTRI', 'Nutrición', null, 'Nutrición', 2024::smallint),
  ('IN23CULTURAL', 'Cultura Externa', null, 'Cultura Externa', 2023::smallint),
  ('IN23MKTPLACE', 'Marketplace', null, 'Marketplace', 2023::smallint),
  ('IN23CONSULT', 'Método y Consultoría', '7190000026', 'Método y Consultoría', 2023::smallint),
  ('IN23VIAJES', 'Viajes', null, 'Viajes', 2023::smallint),
  ('IN23REUNION', 'Método y Consultoría', null, 'Método y Consultoría', 2023::smallint),
  ('IN241000HA', 'Polar en el Campo', null, 'Polar en el Campo', 2024::smallint),
  ('9000100528', 'Nutrición', null, 'Nutrición', null::smallint),
  ('9000100526', 'Cultura Interna', null, 'Cultura Interna', null::smallint),
  ('9000100524', 'Método y Consultoría', '7190000026', 'Método y Consultoría', null::smallint),
  ('9000100522', 'Snacks USA', null, 'Snacks USA', null::smallint),
  ('9000100521', 'Cultura Externa', null, 'Cultura Externa', null::smallint),
  ('9000100520', 'Polar en el Campo', '7190000026', 'Polar en el Campo', null::smallint),
  ('9000100525', 'Ambición', null, 'Ambición', null::smallint),
  ('9000100527', 'Polar en el Campo', null, 'Polar en el Campo', null::smallint),
  ('9000101040', 'Polar en el Campo', null, 'Polar en el Campo', null::smallint),
  ('A801259461', 'Polar en el Campo', null, 'Polar en el Campo', null::smallint),
  ('#CAM', 'Polar en el Campo', null, 'Polar en el Campo', null::smallint),
  ('#NUT', 'Nutrición', null, 'Nutrición', null::smallint),
  ('#SNA', 'Snacks USA', null, 'Snacks USA', null::smallint),
  ('#MET', 'Método y Consultoría', null, 'Método y Consultoría', null::smallint),
  ('#CUL.INT', 'Cultura Interna', null, 'Cultura Interna', null::smallint),
  ('#CUL.EXT', 'Cultura Externa', null, 'Cultura Externa', null::smallint),
  ('#AMB', 'Ambición', null, 'Ambición', null::smallint),
  ('#IGC.SNA', 'Snacks USA', null, 'Snacks USA', null::smallint),
  ('9000101160', 'Polar en el Campo', null, 'Polar en el Campo', null::smallint),
  ('9000101161', 'Cultura Externa', null, 'Cultura Externa', null::smallint),
  ('9000101983', 'Polar en el Campo', null, 'Polar en el Campo', null::smallint),
  ('9000101162', 'Método y Consultoría', '7330000000', 'Método y Consultoría', null::smallint),
  ('9000101163', 'Ambición', null, 'Ambición', null::smallint),
  ('9000101164', 'Cultura Interna', null, 'Cultura Interna', null::smallint),
  ('9000101165', 'Nutrición', null, 'Nutrición', null::smallint),
  ('9000101982', 'Polar en el Campo', null, 'Polar en el Campo', null::smallint),
  ('9000101166', 'Nutrición', null, 'Nutrición', null::smallint),
  ('9000101500', 'Snacks USA', null, 'Snacks USA', null::smallint),
  ('#PLANIF.EST', 'Planificación Estratégica', null, 'Planificación Estratégica', null::smallint),
  ('#TRANS.EP', 'Transformación Empresas Polar', null, 'Transformación Empresas Polar', null::smallint),
  ('#NO APLICA', 'No Aplica', null, 'No Aplica', null::smallint),
  ('#NEW.CAM', 'Polar en el Campo', null, 'Polar en el Campo', null::smallint)
) as v(codigo_oi, nombre, ceco_codigo, hz_nombre, fy)
left join public.cecos c          on c.codigo_sap = v.ceco_codigo
join      public.hunting_zones hz on hz.nombre    = v.hz_nombre
on conflict (codigo_oi) do update set
  nombre          = excluded.nombre,
  id_ceco         = coalesce(excluded.id_ceco, ordenes_internas.id_ceco),
  id_hunting_zone = excluded.id_hunting_zone;

-- ---------------------------------------------------------------------------
-- 5. Taxonomía oficial (Fase > Motivo > Detalle) — resultado de la Fase 1
-- ---------------------------------------------------------------------------
insert into public.taxonomias (fase, motivo, detalle) values
  ('Continuidad Operativa', 'Consultoría', 'Planificación Estratégica'),
  ('Continuidad Operativa', 'Q Torta', 'Grabación de Contenido'),
  ('Continuidad Operativa', 'Q Torta', 'Logística'),
  ('Continuidad Operativa', 'Q Torta', 'Material POP'),
  ('Continuidad Operativa', 'Seguimiento Operativo', 'Comidas y Refrigerios'),
  ('Continuidad Operativa', 'Seguimiento Operativo', 'Material de Trabajo'),
  ('Continuidad Operativa', 'Tecnología', 'Licencias'),
  ('Continuidad Operativa', 'Viaje Internacional', 'Gastos de Viaje'),
  ('Ideación', 'Seguimiento Operativo', 'Comidas y Refrigerios'),
  ('Ideación', 'Seguimiento Operativo', 'Traslados Nacionales'),
  ('Incubación', 'Consultoría', 'Estrategia'),
  ('Incubación', 'Consultoría', 'Prototipado'),
  ('Incubación', 'Investigación de Mercado', 'Estudios')
on conflict (fase, motivo, detalle) do nothing;
