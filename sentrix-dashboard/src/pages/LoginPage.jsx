import { useState } from "react";
import {
  Activity,
  CheckCircle2,
  Lock,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { SentrixLogo, SentrixLogoLoader } from "../components/SentrixLogo.jsx";

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
    <div className="flex min-h-screen items-center justify-center bg-mist px-4 py-8 text-ink sm:px-6 lg:px-8">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-2xl border border-line bg-white shadow-2xl shadow-slate-200/80 lg:min-h-[610px] lg:grid-cols-[1fr_1.05fr]">
        <section
          className="order-2 flex min-h-[360px] flex-col justify-between bg-ink bg-cover bg-center p-6 text-white sm:p-8 lg:order-1 lg:p-10"
          style={{
            backgroundImage:
              "linear-gradient(90deg, rgba(15, 23, 42, 0.98), rgba(15, 23, 42, 0.82)), url('https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80')",
          }}
        >
          <SentrixLogo inverse />

          <div className="my-10">
            <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15 sm:h-14 sm:w-14">
              <ShieldCheck size={24} />
            </div>
            <h1 className="max-w-md text-3xl font-bold leading-tight tracking-normal sm:text-4xl">
              Secure lab monitoring starts here.
            </h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-slate-300 sm:text-base">
              Sign in to manage registered devices, live health metrics, and
              network discovery from one focused console.
            </p>
          </div>

          <div className="grid gap-3 text-sm text-slate-200 sm:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-white/10 p-3">
              <CheckCircle2 className="mb-2 text-emerald-300" size={18} />
              <p className="font-semibold">Realtime agent status</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/10 p-3">
              <Activity className="mb-2 text-cyan-300" size={18} />
              <p className="font-semibold">Live lab performance</p>
            </div>
          </div>
        </section>

        <section className="order-1 flex items-center p-6 sm:p-8 lg:order-2 lg:p-10">
          <div className="mx-auto w-full max-w-md">
            <p className="text-sm font-semibold text-ocean">Sentrix Console</p>
            <h2 className="mt-3 text-3xl font-bold tracking-normal sm:text-4xl">
              Welcome back
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Enter your admin credentials to continue.
            </p>

            <div
              className="mt-6 min-h-36 rounded-xl border border-line bg-cover bg-center shadow-inner sm:min-h-44 lg:hidden"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, rgba(15, 23, 42, 0.78), rgba(15, 118, 110, 0.4)), url('https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1000&q=80')",
              }}
            />

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <label className="block text-sm font-semibold text-slate-700">
                Email
                <span className="mt-2 flex items-center gap-3 rounded-lg border border-line bg-slate-50 px-3 transition focus-within:border-signal focus-within:ring-2 focus-within:ring-blue-100">
                  <Mail className="shrink-0 text-slate-400" size={18} />
                  <input
                    className="min-h-12 w-full min-w-0 bg-transparent text-sm outline-none"
                    placeholder="admin@sentrix.local"
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
                    placeholder="Enter your password"
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
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-signal px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-signal-dark disabled:cursor-wait disabled:opacity-70"
                type="submit"
                disabled={loading}
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <SentrixLogoLoader compact />
                    Signing in...
                  </span>
                ) : (
                  "Sign in"
                )}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
