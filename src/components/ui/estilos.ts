/**
 * Clases compartidas de controles de formulario.
 *
 * La altura se fija explícitamente porque <select> y <input> la calculan
 * distinto con el mismo padding: sin `h-*` los formularios quedan asimétricos.
 */

export const CONTROL =
  "block w-full h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm " +
  "text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none " +
  "focus:border-[var(--blue)] focus:ring-2 focus:ring-[rgba(46,117,182,0.18)]";

/** Variante compacta para grillas densas como la Sala de Triaje. */
export const CONTROL_COMPACTO =
  "block w-full h-8 rounded-md border border-[var(--line)] bg-white px-2 text-sm " +
  "text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none " +
  "focus:border-[var(--blue)] focus:ring-2 focus:ring-[rgba(46,117,182,0.18)]";

export const ETIQUETA = "block text-sm font-semibold text-[var(--ink-soft)]";

export const AYUDA = "mt-1 text-xs text-[var(--muted)]";
