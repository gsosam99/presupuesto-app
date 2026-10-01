"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function FormularioLogin() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  /** Modo "olvidé mi contraseña": se pide solo el correo. */
  const [recuperando, setRecuperando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function pedirEnlace(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/recuperar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "No se pudo enviar el correo.");
        return;
      }
      setEnviado(true);
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setEnviando(false);
    }
  }

  function cambiarModo(recuperar: boolean) {
    setRecuperando(recuperar);
    setEnviado(false);
    setError(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    setError(null);

    const { error: errorAuth } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (errorAuth) {
      setError(
        errorAuth.message === "Invalid login credentials"
          ? "Email o contraseña incorrectos."
          : errorAuth.message,
      );
      setEnviando(false);
      return;
    }

    router.replace("/cargas");
    router.refresh();
  }

  if (recuperando) {
    return (
      <form onSubmit={pedirEnlace} className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Recuperar contraseña</h2>
          <p className="mt-1 text-sm text-slate-600">
            Te enviamos un enlace para elegir una contraseña nueva.
          </p>
        </div>

        {enviado ? (
          <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Si <strong>{email}</strong> tiene acceso a la app, en unos minutos le llega el correo.
            Revisa también la carpeta de spam. El enlace vence en una hora.
          </p>
        ) : (
          <>
            <div>
              <label htmlFor="email-recuperar" className="block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="email-recuperar"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>

            {error && (
              <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            )}

            <Button cargando={enviando} type="submit" disabled={enviando} className="w-full">
              {enviando ? "Enviando…" : "Enviar enlace"}
            </Button>
          </>
        )}

        <button
          type="button"
          onClick={() => cambiarModo(false)}
          className="w-full text-center text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline"
        >
          ← Volver a entrar
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">
            Contraseña
          </label>
          <button
            type="button"
            onClick={() => cambiarModo(true)}
            className="text-xs font-medium text-slate-600 hover:text-slate-900 hover:underline"
          >
            ¿Olvidaste tu contraseña?
          </button>
        </div>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <Button cargando={enviando} type="submit" disabled={enviando} className="w-full">
        {enviando ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
