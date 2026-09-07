"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface Props {
  /** "header": estilo original, botón compacto con borde. "sidebar": full-width, con ícono. */
  variante?: "header" | "sidebar";
  /** Solo aplica a variante="sidebar": oculta la etiqueta y deja solo el ícono. */
  colapsado?: boolean;
}

export function BotonSalir({ variante = "header", colapsado = false }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [saliendo, setSaliendo] = useState(false);

  async function salir() {
    setSaliendo(true);
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (variante === "sidebar") {
    return (
      <button
        type="button"
        onClick={() => void salir()}
        disabled={saliendo}
        title="Cerrar sesión"
        className={
          "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-[#eaf2f7] " +
          "transition-colors hover:bg-[rgba(143,180,201,0.15)] disabled:opacity-50" +
          (colapsado ? " justify-center" : "")
        }
      >
        <LogOut className="size-4 shrink-0" aria-hidden />
        {!colapsado && <span className="truncate">{saliendo ? "Saliendo…" : "Cerrar sesión"}</span>}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void salir()}
      disabled={saliendo}
      className="rounded-md border border-[rgba(143,180,201,0.35)] bg-[rgba(255,255,255,0.08)] px-3 py-1.5 text-xs font-medium text-[#eaf2f7] transition-colors hover:bg-[rgba(143,180,201,0.2)] disabled:opacity-50"
    >
      {saliendo ? "Saliendo…" : "Cerrar sesión"}
    </button>
  );
}
