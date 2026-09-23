import { PestanasNav } from "@/components/ui/PestanasNav";

/** Pestañas compartidas por la Sala de Triaje, el asistente y el historial. */
export function PestanasTriaje({
  activa,
  puedeCargar,
}: {
  activa: "/triaje" | "/triaje/carga" | "/cargas";
  puedeCargar: boolean;
}) {
  return (
    <PestanasNav
      etiqueta="Triaje"
      className="mt-6"
      activa={activa}
      pestanas={[
        { href: "/triaje", etiqueta: "Pendientes" },
        ...(puedeCargar ? [{ href: "/triaje/carga", etiqueta: "Nueva carga SAP" }] : []),
        { href: "/cargas", etiqueta: "Historial de cargas" },
      ]}
    />
  );
}
