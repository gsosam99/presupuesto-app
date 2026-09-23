import Link from "next/link";

export interface PestanaNav {
  href: string;
  etiqueta: string;
}

interface Props {
  etiqueta: string;
  pestanas: PestanaNav[];
  /** href de la pestaña activa. */
  activa: string;
  className?: string;
}

/**
 * Pestañas que navegan entre sub-rutas de una sección (p. ej. Facturas →
 * Tabla / Registrar). Son links, no role="tab": cada una es una página.
 */
export function PestanasNav({ etiqueta, pestanas, activa, className }: Props) {
  return (
    <nav aria-label={etiqueta} className={`ui-tabs ${className ?? ""}`}>
      {pestanas.map((p) => (
        <Link
          key={p.href}
          href={p.href}
          aria-current={p.href === activa ? "page" : undefined}
          className="ui-tab"
        >
          {p.etiqueta}
        </Link>
      ))}
    </nav>
  );
}
