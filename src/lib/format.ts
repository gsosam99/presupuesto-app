/** Formateadores compartidos de UI. */

/** Monto en bolívares/dólares, siempre con 2 decimales. */
export const moneda = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
