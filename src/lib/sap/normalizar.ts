/**
 * Normalizadores de los valores crudos que exporta SAP.
 *
 * SAP marca los nulos con "#" (y variantes como "#/#" o "Sin asignar"), y
 * exporta números en locale es-VE: punto de miles, coma decimal.
 */

/** Marcadores que SAP usa para "sin valor". */
const NULOS_SAP = new Set(["#", "#/#", "-", "sin asignar", "no asignado"]);

/** Devuelve null cuando el valor es un marcador de nulo de SAP. */
export function valorSap(crudo: string | null | undefined): string | null {
  if (crudo === null || crudo === undefined) return null;
  const v = crudo.replace(/\s+/g, " ").trim();
  if (v === "" || NULOS_SAP.has(v.toLowerCase())) return null;
  return v;
}

/**
 * Convierte un monto es-VE a número.
 * "4.897,55" -> 4897.55 | "-53.710,00" -> -53710 | "316,46" -> 316.46
 *
 * Ojo: parseFloat("173,54") devuelve 173. Nunca usar parseFloat acá.
 */
export function parsearMontoSap(crudo: string | null | undefined): number | null {
  const v = valorSap(crudo);
  if (v === null) return null;

  let s = v.replace(/\s/g, "");
  const negativo = s.startsWith("-") || /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, "").replace(/^-/, "");

  const tieneComa = s.includes(",");
  const tienePunto = s.includes(".");

  if (tieneComa && tienePunto) {
    // El separador que aparece último es el decimal.
    s =
      s.lastIndexOf(",") > s.lastIndexOf(".")
        ? s.replace(/\./g, "").replace(",", ".")
        : s.replace(/,/g, "");
  } else if (tieneComa) {
    // "4897,55" decimal | "1,234" con 3 decimales exactos se asume miles.
    const decimales = s.length - s.lastIndexOf(",") - 1;
    s = decimales === 3 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (tienePunto) {
    // Solo puntos: si el último grupo tiene 3 dígitos es separador de miles.
    const decimales = s.length - s.lastIndexOf(".") - 1;
    if (decimales === 3) s = s.replace(/\./g, "");
  }

  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

/** "19.03.2024" -> "2024-03-19". Acepta también DD/MM/YYYY e ISO. */
export function parsearFechaSap(crudo: string | null | undefined): string | null {
  const v = valorSap(crudo);
  if (v === null) return null;

  let m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(v);
  if (m) {
    const [, d, mes, a] = m;
    return `${a}-${mes.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) return v;

  return null;
}

/**
 * SAP concatena código y contexto con "/": "DIVA/7190000026" -> "7190000026",
 * "CR/71958" -> "71958". Si no hay "/", devuelve el valor limpio.
 */
export function codigoDespuesDeBarra(crudo: string | null | undefined): string | null {
  const v = valorSap(crudo);
  if (v === null) return null;
  const partes = v.split("/");
  const ultimo = partes[partes.length - 1].trim();
  return valorSap(ultimo);
}

/**
 * Clave de cruce de facturas. Espejo EXACTO de la columna generada
 * `numero_normalizado` en Postgres: mayúsculas, sin espacios y sin ceros a la
 * izquierda. SAP emite "0000019441", el usuario registra "19441".
 *
 * Si cambia acá, tiene que cambiar en supabase/schema.sql.
 */
export function normalizarNumeroFactura(
  crudo: string | null | undefined,
): string | null {
  const v = valorSap(crudo);
  if (v === null) return null;
  const limpio = v.replace(/\s/g, "").toUpperCase().replace(/^0+/, "");
  return limpio === "" ? null : limpio;
}

/** Normaliza texto para comparar (tags, proveedores). */
export function claveComparacion(valor: string | null): string | null {
  if (valor === null) return null;
  const v = valor.replace(/\s+/g, " ").trim().toUpperCase();
  return v === "" ? null : v;
}
