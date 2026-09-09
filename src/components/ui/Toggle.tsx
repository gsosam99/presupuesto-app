"use client";

interface Props {
  checked: boolean;
  onChange: (valor: boolean) => void;
  /** Va al aria-label: el toggle no lleva texto propio dentro de una tabla. */
  etiqueta: string;
  disabled?: boolean;
}

/**
 * Interruptor de sí/no para campos de estado (Activo, Auto-archivar…).
 *
 * Es un <button role="switch"> y no un <input type="checkbox"> porque
 * visualmente ya no es una casilla: un lector de pantalla debe anunciarlo como
 * interruptor. `aria-checked` es lo que comunica el estado, así que el color
 * nunca es la única señal.
 *
 * La perilla se mueve con `transform` (no con `left`) para no provocar layout
 * shift al animar.
 */
export function Toggle({ checked, onChange, etiqueta, disabled = false }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={etiqueta}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors " +
        "focus:outline-none focus:ring-2 focus:ring-[rgba(46,117,182,0.3)] " +
        "disabled:cursor-not-allowed disabled:opacity-50 " +
        (checked
          ? "border-[var(--ok)] bg-[var(--ok)]"
          : "border-[var(--line)] bg-[var(--line-soft)]")
      }
    >
      <span
        className={
          "inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform " +
          (checked ? "translate-x-[1.15rem]" : "translate-x-[0.15rem]")
        }
      />
    </button>
  );
}
