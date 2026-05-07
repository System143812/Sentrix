import { useState } from "react";
import { Lock, Mail, ShieldCheck } from "lucide-react";
import { SentrixLogo } from "../components/SentrixLogo.jsx";

export function LoginPage({ onLogin, error }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);

    try {
      await onLogin(email, password);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-mist px-4 py-10 text-ink">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-2xl border border-line bg-white shadow-2xl shadow-slate-200/80 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="flex min-h-[320px] flex-col justify-between bg-ink p-8 text-white sm:p-10">
          <SentrixLogo inverse />
          <div className="mt-12">
            <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
              <ShieldCheck size={24} />
            </div>
            <h1 className="max-w-sm text-3xl font-bold leading-tight tracking-normal sm:text-4xl">
              Secure lab monitoring starts here.
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-6 text-slate-300">
              Sign in to manage registered devices, live health metrics, and
              network discovery from one focused console.
            </p>
          </div>
        </section>

        <section className="p-6 sm:p-10">
          <div className="mx-auto max-w-md">
            <p className="text-sm font-semibold text-ocean">Sentrix Console</p>
            <h2 className="mt-3 text-3xl font-bold tracking-normal">
              Welcome back
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Enter your admin credentials to continue.
            </p>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <label className="block text-sm font-semibold text-slate-700">
                Email
                <span className="mt-2 flex items-center gap-3 rounded-lg border border-line bg-slate-50 px-3 transition focus-within:border-signal focus-within:ring-2 focus-within:ring-blue-100">
                  <Mail className="shrink-0 text-slate-400" size={18} />
                  <input
                    className="min-h-12 w-full min-w-0 bg-transparent text-sm outline-none"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </span>
              </label>

              <label className="block text-sm font-semibold text-slate-700">
                Password
                <span className="mt-2 flex items-center gap-3 rounded-lg border border-line bg-slate-50 px-3 transition focus-within:border-signal focus-within:ring-2 focus-within:ring-blue-100">
                  <Lock className="shrink-0 text-slate-400" size={18} />
                  <input
                    className="min-h-12 w-full min-w-0 bg-transparent text-sm outline-none"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </span>
              </label>

              {error ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                  {error}
                </p>
              ) : null}

              <button
                className="h-12 w-full rounded-lg bg-signal px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-signal-dark disabled:cursor-not-allowed disabled:opacity-70"
                type="submit"
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
