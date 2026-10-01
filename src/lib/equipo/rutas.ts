/**
 * Ruta donde se elige la contraseña (invitación y "olvidé mi contraseña").
 * En su propio módulo porque la usan también Client Components, que no pueden
 * importar accesos.ts (usa la clave secreta).
 */
export const RUTA_INVITACION = "/auth/invitacion";
