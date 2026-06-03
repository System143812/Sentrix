import { useState } from "react";
import {
  Activity,
  CheckCircle2,
  ShieldCheck,
  Mail,
  Lock,
} from "lucide-react";
import { SentrixLogo, SentrixLogoLoader } from "../components/SentrixLogo.jsx";
import { FormInput } from "../components/FormInput.jsx";
import { PasswordValidator } from "../components/PasswordValidator.jsx";

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
    <div className="page-reveal flex min-h-screen items-center justify-center bg-mist px-4 py-8 text-ink sm:px-6 lg:px-8">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-lg border border-line bg-white shadow-sm shadow-slate-200/80 lg:min-h-[610px] lg:grid-cols-[1fr_1.05fr]">
        <section
          className="order-2 flex min-h-[360px] flex-col justify-between bg-ink bg-cover bg-center p-6 text-white sm:p-8 lg:order-1 lg:p-10"
          style={{
            backgroundImage:
              "linear-gradient(90deg, rgba(15, 23, 42, 0.98), rgba(15, 23, 42, 0.82)), url('/login_header.jpg')",
          }}
        >
          <SentrixLogo inverse />

          <div className="my-10">
            <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15 sm:h-14 sm:w-14">
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
            <p className="text-sm font-medium text-ocean">Sentrix Console</p>
            <h2 className="mt-3 text-3xl font-bold tracking-normal sm:text-4xl">
              Welcome back
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Enter your admin credentials to continue.
            </p>

            <div
              className="mt-6 flex min-h-36 items-center justify-center rounded-lg border border-line bg-cover bg-center shadow-inner sm:min-h-44 lg:hidden relative overflow-hidden"
              style={{
                backgroundImage:
                  "url('/login_mobile_header.jpg')",
              }}
            >
              <div className="absolute inset-0 bg-slate-950/65 backdrop-blur-[1px]" />
              <div className="relative z-10">
                <SentrixLogo inverse framed={false} size="md" />
              </div>
            </div>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <FormInput
                label="Email"
                type="email"
                placeholder="admin@sentrix.local"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                icon={Mail}
              />

              <div>
                <FormInput
                  label="Password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  icon={Lock}
                />
              </div>

              {error ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                  {error}
                </p>
              ) : null}

              <button
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition hover:bg-slate-900 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
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
