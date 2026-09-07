"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, PanelLeftClose, PanelLeftOpen, Settings, X } from "lucide-react";

import { BotonSalir } from "@/components/auth/BotonSalir";

import { NAVEGACION } from "./navegacion";

const CLAVE_COLAPSADO = "ienn:sidebar-colapsado";
/** Same-tab: `storage` no dispara en el propio documento que escribe. */
const EVENTO_CAMBIO_COLAPSADO = "ienn:sidebar-colapsado-cambio";

function leerColapsado(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_COLAPSADO) === "1";
  } catch {
    return false;
  }
}

function escribirColapsado(valor: boolean): void {
  try {
    window.localStorage.setItem(CLAVE_COLAPSADO, valor ? "1" : "0");
  } catch {
    // Sin persistencia disponible: el toggle igual funciona en la sesión.
  }
  window.dispatchEvent(new Event(EVENTO_CAMBIO_COLAPSADO));
}

function suscribirseColapsado(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENTO_CAMBIO_COLAPSADO, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENTO_CAMBIO_COLAPSADO, callback);
  };
}

/** El servidor siempre renderiza "expandido"; la preferencia real llega tras hidratar. */
function snapshotColapsadoServidor(): boolean {
  return false;
}

interface Props {
  usuario: { email: string };
}

function esRutaActiva(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ usuario }: Props) {
  const pathname = usePathname();
  const colapsado = useSyncExternalStore(
    suscribirseColapsado,
    leerColapsado,
    snapshotColapsadoServidor,
  );
  const [mobileAbierto, setMobileAbierto] = useState(false);

  function alternarColapso() {
    escribirColapsado(!colapsado);
  }

  // Cerrar el drawer mobile al navegar: se ajusta durante el render (no en un
  // efecto) comparando contra el pathname anterior, patrón recomendado por
  // React para "resetear estado cuando cambia una prop/valor derivado".
  const [pathnameAnterior, setPathnameAnterior] = useState(pathname);
  if (pathname !== pathnameAnterior) {
    setPathnameAnterior(pathname);
    if (mobileAbierto) setMobileAbierto(false);
  }

  // Cerrar con Escape.
  useEffect(() => {
    if (!mobileAbierto) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileAbierto(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileAbierto]);

  return (
    <>
      {/* Barra superior delgada, solo mobile: da acceso al drawer. */}
      <header className="app-nav no-print flex items-center justify-between gap-3 bg-[var(--navy)] px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileAbierto(true)}
          aria-label="Abrir navegación"
          aria-expanded={mobileAbierto}
          className="rounded-md p-1.5 text-[#eaf2f7] hover:bg-[rgba(143,180,201,0.15)]"
        >
          <Menu className="size-5" aria-hidden />
        </button>
        <Link href="/dashboard" className="leading-tight">
          <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-[#8fb4c9]">
            Empresas Polar
          </span>
          <span className="block text-sm font-extrabold text-white">IENN Gastos</span>
        </Link>
        <span className="w-8" aria-hidden />
      </header>

      {/* Backdrop del drawer mobile. */}
      {mobileAbierto && (
        <div
          aria-hidden
          onClick={() => setMobileAbierto(false)}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      )}

      <aside
        className={
          "app-nav no-print fixed inset-y-0 left-0 z-50 flex flex-col bg-[var(--navy)] " +
          "transition-transform duration-200 lg:sticky lg:top-0 lg:h-svh lg:translate-x-0 lg:transition-[width] " +
          (mobileAbierto ? "translate-x-0" : "-translate-x-full lg:translate-x-0") +
          " " +
          (colapsado ? "w-64 lg:w-16" : "w-64")
        }
      >
        {/* Franja de acento, mismo gradiente que antes vivía bajo el header. */}
        <span
          aria-hidden
          className="absolute inset-y-0 right-0 w-[2px] bg-[linear-gradient(180deg,var(--blue),var(--cyan)_55%,var(--gold))]"
        />

        <div className="flex items-center justify-between gap-2 px-4 py-4">
          {(!colapsado || mobileAbierto) && (
            <Link href="/dashboard" className="min-w-0 leading-tight">
              <span className="block truncate text-[10px] font-bold uppercase tracking-[0.16em] text-[#8fb4c9]">
                Empresas Polar
              </span>
              <span className="block truncate text-sm font-extrabold text-white">IENN Gastos</span>
            </Link>
          )}

          <button
            type="button"
            onClick={() => setMobileAbierto(false)}
            aria-label="Cerrar navegación"
            className="rounded-md p-1.5 text-[#eaf2f7] hover:bg-[rgba(143,180,201,0.15)] lg:hidden"
          >
            <X className="size-5" aria-hidden />
          </button>

          <button
            type="button"
            onClick={alternarColapso}
            aria-label={colapsado ? "Expandir barra lateral" : "Colapsar barra lateral"}
            aria-expanded={!colapsado}
            className="hidden shrink-0 rounded-md p-1.5 text-[#8fb4c9] hover:bg-[rgba(143,180,201,0.15)] hover:text-white lg:block"
          >
            {colapsado ? (
              <PanelLeftOpen className="size-4" aria-hidden />
            ) : (
              <PanelLeftClose className="size-4" aria-hidden />
            )}
          </button>
        </div>

        <nav aria-label="Principal" className="flex-1 overflow-y-auto px-2 pb-4">
          {NAVEGACION.map((grupo, i) => (
            <div key={grupo.titulo ?? `grupo-${i}`} className={i > 0 ? "mt-4" : undefined}>
              {grupo.titulo && (!colapsado || mobileAbierto) && (
                <p className="px-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#6f95ab]">
                  {grupo.titulo}
                </p>
              )}
              <ul className="space-y-0.5">
                {grupo.items.map(({ href, etiqueta, icono: Icono }) => {
                  const activa = esRutaActiva(pathname, href);
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        title={colapsado && !mobileAbierto ? etiqueta : undefined}
                        aria-current={activa ? "page" : undefined}
                        className={
                          "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-semibold transition-colors " +
                          (colapsado && !mobileAbierto ? "justify-center" : "") +
                          " " +
                          (activa
                            ? "bg-[rgba(143,180,201,0.22)] text-white"
                            : "text-[#b9cedc] hover:bg-[rgba(143,180,201,0.15)] hover:text-white")
                        }
                      >
                        <Icono className="size-4 shrink-0" aria-hidden />
                        {(!colapsado || mobileAbierto) && <span className="truncate">{etiqueta}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-[rgba(143,180,201,0.2)] px-2 py-3">
          <Link
            href="/configuracion"
            title={colapsado && !mobileAbierto ? "Configuración" : undefined}
            aria-current={esRutaActiva(pathname, "/configuracion") ? "page" : undefined}
            className={
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-semibold transition-colors " +
              (colapsado && !mobileAbierto ? "justify-center" : "") +
              " " +
              (esRutaActiva(pathname, "/configuracion")
                ? "bg-[rgba(143,180,201,0.22)] text-white"
                : "text-[#b9cedc] hover:bg-[rgba(143,180,201,0.15)] hover:text-white")
            }
          >
            <Settings className="size-4 shrink-0" aria-hidden />
            {(!colapsado || mobileAbierto) && <span className="truncate">Configuración</span>}
          </Link>

          <div className={"mt-1 " + (colapsado && !mobileAbierto ? "" : "px-2.5")}>
            {(!colapsado || mobileAbierto) && (
              <p className="truncate pb-1 text-[11px] text-[#8fb4c9]">{usuario.email}</p>
            )}
          </div>
          <BotonSalir variante="sidebar" colapsado={colapsado && !mobileAbierto} />
        </div>
      </aside>
    </>
  );
}
