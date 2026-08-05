"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function BotonSalir() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [saliendo, setSaliendo] = useState(false);

  async function salir() {
    setSaliendo(true);
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
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
