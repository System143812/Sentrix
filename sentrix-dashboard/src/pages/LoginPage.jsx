import { useState, useEffect } from "react";
import {
  Activity,
  CheckCircle2,
  ShieldCheck,
  Mail,
  Lock,
  AlertCircle,
  ShieldAlert,
  Info,
  AlertTriangle,
} from "lucide-react";
import { SentrixLogo, SentrixLogoLoader } from "../components/SentrixLogo.jsx";
import { FormInput } from "../components/FormInput.jsx";
import { LegalModal } from "../components/LegalModal.jsx";
import { LEGAL_CONTENT } from "../shared/legalContent.js";
import { getApiUrl } from "../services/api.js";

function LoginAlert({ error }) {
  if (!error) return null;

  const errorMessage = typeof error === "string" ? error : error.message;
  const normalized = errorMessage.toLowerCase();

  const isNetworkError =
    normalized.includes("failed to fetch") ||
    normalized.includes("fetch failed") ||
    normalized.includes("networkerror") ||
    normalized.includes("connection refused");

  if (isNetworkError) {
    return (
      <div className="flex flex-col gap-4 rounded-xl border border-sky-100 bg-sky-50/50 p-4 animate-in fade-in slide-in-from-top-1">
        <div className="flex items-start gap-3.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-sky-600 shadow-sm border border-sky-100">
            <ShieldCheck size={18} strokeWidth={2.5} />
          </span>
          <div className="flex-1 pt-0.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600/80">
              Security Authorization
            </p>
            <p className="mt-1 text-sm font-bold leading-relaxed text-slate-900">
              Browser security is blocking the backend.
            </p>
          </div>
        </div>

        <p className="text-[12px] leading-relaxed text-slate-500">
          This happens on new devices. Click below, select{" "}
          <strong className="text-slate-700">"Advanced"</strong> and then{" "}
          <strong className="text-slate-700">"Proceed"</strong> to grant access,
          then come back here.
        </p>

        <button
          onClick={() => {
            const win = window.open(`${getApiUrl()}/health`, "_blank");
            if (win) win.opener = window;
          }}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-xs font-bold text-white shadow-lg shadow-slate-900/10 transition hover:bg-slate-900 active:scale-[0.98]"
        >
          Authorize This Device
        </button>
      </div>
    );
  }

  const attemptsRemaining =
    error?.attemptsRemaining ?? error?.data?.attemptsRemaining;

  const isBlocked =
    normalized.includes("blocked") ||
    normalized.includes("unauthorized") ||
    normalized.includes("too many attempts");
  const isInvalid = normalized.includes("invalid");
  const isDisabled = normalized.includes("disabled");

  let icon = AlertCircle;
  let title = "System Alert";
  let colorClass = "border-rose-200 bg-rose-50/50 text-rose-700";
  let iconClass = "text-rose-500";

  if (isBlocked) {
    icon = ShieldAlert;
    title = "Access Restricted";
    colorClass = "border-rose-200 bg-rose-50/50 text-rose-900";
    iconClass = "text-rose-600";
  } else if (isInvalid) {
    icon = Lock;
    title = "Authentication Failed";
    colorClass = "border-rose-200 bg-rose-50/50 text-rose-900";
    iconClass = "text-rose-600";
  } else if (isDisabled) {
    icon = Info;
    title = "Account Inactive";
    colorClass = "border-slate-200 bg-slate-50 text-slate-600";
    iconClass = "text-slate-400";
  }

  const Icon = icon;

  return (
    <div
      className={`flex flex-col gap-3.5 rounded-xl border p-4 transition-all duration-500 animate-in fade-in slide-in-from-top-1 ${colorClass}`}
    >
      <div className="flex items-start gap-3.5">
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/80 ${iconClass}`}
        >
          <Icon size={18} strokeWidth={2.5} />
        </span>
        <div className="flex-1 min-w-0 pt-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider opacity-60">
            {title}
          </p>
          <p className="mt-1 text-sm font-semibold leading-relaxed">
            {errorMessage}
          </p>
        </div>
      </div>

      {attemptsRemaining !== undefined &&
        attemptsRemaining <= 5 &&
        attemptsRemaining > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-rose-100/50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-rose-700">
            <AlertTriangle size={12} />
            <span>
              {attemptsRemaining}{" "}
              {attemptsRemaining === 1 ? "attempt" : "attempts"} remaining
              before security lock
            </span>
          </div>
        )}
    </div>
  );
}

export function LoginPage({ onLogin, error: externalError }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [internalError, setInternalError] = useState(null);
  const [legalType, setLegalType] = useState(null); // 'TERMS' | 'PRIVACY' | null
  const [hasAuthorized, setHasAuthorized] = useState(false);

  const displayError = hasAuthorized ? null : (internalError || externalError);

  const errorMessage = (typeof displayError === "string" ? displayError : displayError?.message || "").toLowerCase();
  const isNetworkError = !!displayError && (
    errorMessage.includes("failed to fetch") ||
    errorMessage.includes("fetch failed") ||
    errorMessage.includes("networkerror") ||
    errorMessage.includes("connection refused")
  );

  // Real-time "Smart Bridge" detection
  useEffect(() => {
    let interval;
    if (isNetworkError) {
      interval = setInterval(async () => {
        try {
          // Attempt a raw fetch with no-cache to verify the connection
          const res = await fetch(`${getApiUrl()}/health`, { cache: "no-store" });
          if (res.ok) {
            setHasAuthorized(true);
            setInternalError(null);
          }
        } catch (err) {
          // Still blocked
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isNetworkError]);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setInternalError(null);
    setHasAuthorized(false);

    try {
      await onLogin(email, password);
    } catch (err) {
      setInternalError(err);
    } finally {
      setLoading(false);
    }
  }

  const isInvalid = (
    typeof displayError === "string"
      ? displayError
      : displayError?.message || ""
  )
    .toLowerCase()
    .includes("invalid");

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

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <FormInput
                label="Email"
                type="email"
                placeholder="admin@sentrix.local"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                icon={Mail}
                error={isInvalid ? " " : ""} // Pass empty space to trigger red border without double text
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
                  error={isInvalid ? " " : ""}
                />
              </div>

              <LoginAlert error={displayError} />

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

            <div className="mt-6 space-y-4">
              <p className="text-center text-[12px] leading-relaxed text-slate-400">
                By signing in, you agree to our{" "}
                <button
                  onClick={() => setLegalType("TERMS")}
                  className="font-semibold text-slate-500 transition hover:text-ocean hover:underline underline-offset-2"
                >
                  Terms of Service
                </button>{" "}
                and{" "}
                <button
                  onClick={() => setLegalType("PRIVACY")}
                  className="font-semibold text-slate-500 transition hover:text-ocean hover:underline underline-offset-2"
                >
                  Privacy Policy
                </button>
                .
              </p>
            </div>
          </div>
        </section>
      </div>

      <LegalModal
        isOpen={!!legalType}
        onClose={() => setLegalType(null)}
        content={LEGAL_CONTENT[legalType]}
      />
    </div>
  );
}
