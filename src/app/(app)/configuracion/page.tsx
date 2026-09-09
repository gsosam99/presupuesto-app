import { PanelMaestras, type SeccionMaestra } from "@/components/maestras/PanelMaestras";
import type { CampoMaestra, FilaMaestra } from "@/components/maestras/TablaMaestra";
import { fyEtiqueta } from "@/lib/fiscal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Configuración — IENN Gastos App" };
export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const supabase = await createSupabaseServerClient();

  const [ois, hzs, cecos, anios] = await Promise.all([
    supabase
      .from("ordenes_internas")
      .select(
        "id, codigo_oi, nombre, tipo, id_ceco, id_hunting_zone, vigencia_desde, vigencia_hasta, activo",
      )
      .order("codigo_oi"),
    supabase
      .from("hunting_zones")
      .select("id, nombre, tag_principal, orden_display, archivar_automatico, activo")
      .order("orden_display"),
    supabase.from("cecos").select("id, codigo_sap, nombre, usa_proyectos, activo").order("codigo_sap"),
    supabase.from("anios_fiscales").select("id, fy, activo").order("fy", { ascending: false }),
  ]);

  const opcionesCeco = ((cecos.data ?? []) as Array<{ id: string; codigo_sap: string }>).map(
    (c) => ({ valor: c.id, etiqueta: c.codigo_sap }),
  );
  const opcionesHz = ((hzs.data ?? []) as Array<{ id: string; nombre: string }>).map((h) => ({
    valor: h.id,
    etiqueta: h.nombre,
  }));

  const camposOi: CampoMaestra[] = [
    { clave: "codigo_oi", etiqueta: "Código", tipo: "texto", obligatorio: true, ancho: "w-40" },
    { clave: "nombre", etiqueta: "Nombre", tipo: "texto" },
    {
      clave: "tipo",
      etiqueta: "Tipo",
      tipo: "select",
      ancho: "w-28",
      opciones: [
        { valor: "real", etiqueta: "Real (SAP)" },
        { valor: "tag", etiqueta: "Etiqueta" },
      ],
    },
    {
      clave: "id_hunting_zone",
      etiqueta: "Hunting Zone",
      tipo: "select",
      opciones: opcionesHz,
      obligatorio: true,
    },
    { clave: "id_ceco", etiqueta: "CeCo padre", tipo: "select", opciones: opcionesCeco },
    { clave: "vigencia_desde", etiqueta: "Vigente desde", tipo: "fecha", ancho: "w-36" },
    { clave: "vigencia_hasta", etiqueta: "Vigente hasta", tipo: "fecha", ancho: "w-36" },
    { clave: "activo", etiqueta: "Activa", tipo: "booleano", ancho: "w-20" },
  ];

  const camposHz: CampoMaestra[] = [
    { clave: "nombre", etiqueta: "Nombre", tipo: "texto", obligatorio: true },
    { clave: "tag_principal", etiqueta: "Etiqueta", tipo: "texto", ancho: "w-32" },
    { clave: "orden_display", etiqueta: "Orden", tipo: "numero", ancho: "w-24" },
    {
      clave: "archivar_automatico",
      etiqueta: "Auto-archivar",
      tipo: "booleano",
      ancho: "w-28",
    },
    { clave: "activo", etiqueta: "Activa", tipo: "booleano", ancho: "w-20" },
  ];

  const camposCeco: CampoMaestra[] = [
    { clave: "codigo_sap", etiqueta: "Código SAP", tipo: "texto", obligatorio: true, ancho: "w-40" },
    { clave: "nombre", etiqueta: "Nombre", tipo: "texto" },
    { clave: "usa_proyectos", etiqueta: "Usa OIs", tipo: "booleano", ancho: "w-24" },
    { clave: "activo", etiqueta: "Activo", tipo: "booleano", ancho: "w-20" },
  ];

  const filasAnios = ((anios.data ?? []) as Array<{ id: string; fy: number; activo: boolean }>).map(
    (a) => ({ ...a, etiqueta: fyEtiqueta(a.fy) }),
  );

  const camposAnios: CampoMaestra[] = [
    { clave: "fy", etiqueta: "FY (año de inicio)", tipo: "numero", obligatorio: true, ancho: "w-32" },
    { clave: "etiqueta", etiqueta: "Etiqueta", tipo: "texto", soloLectura: true, ancho: "w-28" },
    { clave: "activo", etiqueta: "Activo", tipo: "booleano", ancho: "w-20" },
  ];

  const errorCarga = ois.error ?? hzs.error ?? cecos.error ?? anios.error ?? null;

  const secciones: SeccionMaestra[] = [
    {
      id: "anios-fiscales",
      titulo: "Años fiscales",
      entidad: "anios-fiscales",
      campos: camposAnios,
      filas: filasAnios as unknown as FilaMaestra[],
      etiquetaAlta: "Nuevo año fiscal",
      descripcion: (
        <>
          El ciclo arranca en octubre: el FY 2026 es el período Oct-2026..Sep-2027
          (&quot;26/27&quot;). Crea el próximo año fiscal acá antes de que empiece, para que
          aparezca en el selector de todas las pantallas.
        </>
      ),
    },
    {
      id: "ordenes-internas",
      titulo: "Órdenes internas",
      entidad: "ordenes-internas",
      campos: camposOi,
      filas: (ois.data ?? []) as unknown as FilaMaestra[],
      etiquetaAlta: "Nueva orden interna",
      descripcion: (
        <>
          Las de tipo <strong>Real</strong> son órdenes de SAP: cuelgan de un CeCo y pueden
          vencer. Las de tipo <strong>Etiqueta</strong> (#CAM) son transversales y sirven
          para asignar Hunting Zone a los gastos imputados directo al CeCo.
        </>
      ),
    },
    {
      id: "hunting-zones",
      titulo: "Hunting Zones",
      entidad: "hunting-zones",
      campos: camposHz,
      filas: (hzs.data ?? []) as unknown as FilaMaestra[],
      etiquetaAlta: "Nueva Hunting Zone",
      descripcion: (
        <>
          Activar <strong>Auto-archivar</strong> manda a la papelera los gastos de esa zona
          en cada carga de SAP, sin intervención. <strong>Orden</strong> ordena esta tabla y
          el desplegable de Facturas, y decide qué color de la paleta le toca a cada zona en
          el dashboard — donde las zonas se listan por gasto, de mayor a menor.
        </>
      ),
    },
    {
      id: "cecos",
      titulo: "Centros de Costo",
      entidad: "cecos",
      campos: camposCeco,
      filas: (cecos.data ?? []) as unknown as FilaMaestra[],
      etiquetaAlta: "Nuevo Centro de Costo",
    },
  ];

  return (
    <main className="mx-auto w-full max-w-[1240px] px-5 py-8">
      <header>
        <p className="ui-eyebrow">Configuración</p>
        <h1 className="ui-title">Tablas maestras</h1>
        <p className="ui-lead">
          La jerarquía es Hunting Zone ← Orden Interna → Centro de Costo. Un CeCo agrupa
          varias Hunting Zones; una Hunting Zone tiene varias órdenes; y cada orden
          pertenece a una sola Hunting Zone. Los cambios se guardan fila por fila.
        </p>
      </header>

      {errorCarga && (
        <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          No se pudo cargar toda la información: {errorCarga.message}
        </p>
      )}

      <section className="mt-8">
        <PanelMaestras secciones={secciones} />
      </section>
    </main>
  );
}
