"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Estado =
  | { tipo: "verificando" }
  | { tipo: "listo"; email: string; recuperacion: boolean }
  | { tipo: "invalido"; motivo: string; recuperacion: boolean };

const CONTROL =
  "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200";

const MINIMO = 8;

/**
 * Destino del enlace de invitación. Supabase redirige acá con la sesión en
 * el fragmento (#access_token=…&refresh_token=…): se guarda como cookie con
 * setSession y la persona elige su contraseña. Con `?code=` (flujo PKCE) se
 * canjea el código. Sirve igual para el enlace copiado desde Equipo y para
 * el de "olvidé mi contraseña" (type=recovery en el fragmento).
 */
export function FormularioInvitacion() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [estado, setEstado] = useState<Estado>({ tipo: "verificando" });
  const [clave, setClave] = useState("");
  const [repetida, setRepetida] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let cancelado = false;

    async function verificar() {
      const fragmento = new URLSearchParams(window.location.hash.slice(1));
      const consulta = new URLSearchParams(window.location.search);
      const falla = fragmento.get("error_description") ?? consulta.get("error_description");
      const recuperacion = fragmento.get("type") === "recovery";

      if (falla) {
        if (!cancelado) {
          setEstado({
            tipo: "invalido",
            motivo: /expired|invalid/i.test(falla)
              ? "El enlace venció o ya se usó."
              : falla.replace(/\+/g, " "),
            recuperacion,
          });
        }
        return;
      }

      const accessToken = fragmento.get("access_token");
      const refreshToken = fragmento.get("refresh_token");
      const codigo = consulta.get("code");

      const { error: errorSesion } =
        accessToken && refreshToken
          ? await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            })
          : codigo
            ? await supabase.auth.exchangeCodeForSession(codigo)
            : { error: null };

      // Los tokens no deben quedar en la barra de direcciones ni en el historial.
      window.history.replaceState(null, "", window.location.pathname);

      const { data } = await supabase.auth.getUser();
      if (cancelado) return;
      if (errorSesion || !data.user?.email) {
        setEstado({ tipo: "invalido", motivo: "El enlace venció o ya se usó.", recuperacion });
        return;
      }
      setEstado({ tipo: "listo", email: data.user.email, recuperacion });
    }

    void verificar();
    return () => {
      cancelado = true;
    };
  }, [supabase]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (clave.length < MINIMO) {
      setError(`La contraseña debe tener al menos ${MINIMO} caracteres.`);
      return;
    }
    if (clave !== repetida) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setEnviando(true);
    setError(null);
    const { error: errorClave } = await supabase.auth.updateUser({ password: clave });
    if (errorClave) {
      setError(errorClave.message);
      setEnviando(false);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  if (estado.tipo === "verificando") {
    return <p className="text-sm text-slate-600">Verificando la invitación…</p>;
  }

  if (estado.tipo === "invalido") {
    return (
      <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="font-semibold">{estado.motivo}</p>
        <p className="mt-1">
          {estado.recuperacion ? (
            <>
              Pide uno nuevo desde{" "}
              <Link href="/login" className="font-semibold underline">
                Entrar → ¿Olvidaste tu contraseña?
              </Link>
            </>
          ) : (
            "Pídele a un administrador que te reenvíe la invitación desde Configuración → Equipo."
          )}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-slate-600">
        Hola, <strong className="text-slate-900">{estado.email}</strong>.{" "}
        {estado.recuperacion
          ? "Elige tu contraseña nueva."
          : "Elige una contraseña para entrar a la app."}
      </p>

      <div>
        <label htmlFor="clave" className="block text-sm font-medium text-slate-700">
          Contraseña
        </label>
        <input
          id="clave"
          type="password"
          required
          minLength={MINIMO}
          autoComplete="new-password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          className={CONTROL}
        />
        <p className="mt-1 text-xs text-slate-500">Al menos {MINIMO} caracteres.</p>
      </div>

      <div>
        <label htmlFor="repetida" className="block text-sm font-medium text-slate-700">
          Repite la contraseña
        </label>
        <input
          id="repetida"
          type="password"
          required
          autoComplete="new-password"
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
          className={CONTROL}
        />
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <Button cargando={enviando} type="submit" disabled={enviando} className="w-full">
        {enviando ? "Guardando…" : "Guardar contraseña y entrar"}
      </Button>
    </form>
  );
}
