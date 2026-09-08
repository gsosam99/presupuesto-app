"use server";

/**
 * Año fiscal elegido en el selector global (sidebar). Se persiste en una
 * cookie no sensible (preferencia de UI, no de sesión) y la leen del lado del
 * servidor las páginas de gasto/presupuesto que deben quedar acotadas a un
 * solo FY. El Dashboard y Configuración no usan esto: ver
 * src/components/nav/SelectorAnioFiscal.tsx.
 */

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { fyActual } from "@/lib/fiscal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const COOKIE_FY = "ienn:fy-seleccionado";
const UN_ANIO_SEGUNDOS = 60 * 60 * 24 * 365;

/**
 * Año fiscal seleccionado. Si la cookie falta o trae basura (primera visita,
 * o un valor viejo que ya no existe), el default es siempre el FY MÁS
 * RECIENTE dado de alta en anios_fiscales, no el que calcula el calendario:
 * si alguien ya abrió el próximo año en Configuración, la app arranca ahí,
 * aunque hoy todavía estemos calendario adentro del año anterior.
 */
export async function obtenerFySeleccionado(): Promise<number> {
  const cookieStore = await cookies();
  const crudo = cookieStore.get(COOKIE_FY)?.value;
  const fy = Number(crudo);
  if (crudo && Number.isInteger(fy) && fy >= 2015 && fy <= 2100) {
    return fy;
  }
  return fyMasReciente();
}

/** FY activo más alto en la maestra, o fyActual() si todavía no hay ninguno. */
async function fyMasReciente(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("anios_fiscales")
    .select("fy")
    .eq("activo", true)
    .order("fy", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.fy ?? fyActual();
}

/**
 * Server Action del selector global: guarda el FY elegido y refresca el árbol.
 *
 * Recibe el FY como argumento y no como FormData a propósito: si el selector
 * fuera un <form action={...}>, React 19 llama form.reset() al confirmar la
 * acción, y eso devuelve el <select> a la opción marcada en el HTML del
 * servidor (la vieja) sin que React se entere — el bug de "vuelve solo al
 * valor anterior". Sin <form> no hay reset. Ver SelectorAnioFiscal.tsx.
 */
export async function fijarFySeleccionado(fy: number): Promise<void> {
  if (!Number.isInteger(fy) || fy < 2015 || fy > 2100) return;

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_FY, String(fy), {
    maxAge: UN_ANIO_SEGUNDOS,
    sameSite: "lax",
    path: "/",
  });

  revalidatePath("/", "layout");
}
