import { useState, useEffect } from "react";
import {
  ShieldCheck,
  Zap,
  Network,
  Activity,
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
  const [backendUnreachable, setBackendUnreachable] = useState(false);
  const [checkingBackend, setCheckingBackend] = useState(true); // true while the initial probe is in-flight
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Auto-cycle through features every 3.5s unless paused
  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev === null ? 0 : (prev + 1) % 4));
    }, 3500);

    return () => clearInterval(interval);
  }, [isPaused]);

  const features = [
    {
      title: "Secure Pairing",
      description: "Encrypted TLS communication & hardware-bound authentication.",
      icon: ShieldCheck,
      color: "border-emerald-500/40 bg-emerald-500/25 text-emerald-300",
    },
    {
      title: "Power Control",
      description: "Remote power actions (reboot, shutdown, sleep) on client machines.",
      icon: Zap,
      color: "border-orange-500/40 bg-orange-500/25 text-orange-300",
    },
    {
      title: "Subnet Discovery",
      description: "ARP network scanning & automated zero-touch deployment.",
      icon: Network,
      color: "border-indigo-500/40 bg-indigo-500/25 text-indigo-300",
    },
    {
      title: "Live Monitoring",
      description: "Real-time health metrics, screen streaming, and telemetry.",
      icon: Activity,
      color: "border-purple-500/40 bg-purple-500/25 text-purple-300",
    },
  ];

  // --- Proactive backend health check ---
  // Fires immediately on page load, not only after a failed submit.
  useEffect(() => {
    let cancelled = false;
    let interval = null;

    async function probe() {
      try {
        const res = await fetch(`${getApiUrl()}/health`, { cache: "no-store" });
        if (!cancelled) {
          if (res.ok) {
            setBackendUnreachable(false);
            clearInterval(interval);
          } else {
            setBackendUnreachable(true);
          }
        }
      } catch {
        if (!cancelled) setBackendUnreachable(true);
      } finally {
        if (!cancelled) setCheckingBackend(false);
      }
    }

    // Initial probe
    probe();

    // Poll every second until reachable
    interval = setInterval(async () => {
      try {
        const res = await fetch(`${getApiUrl()}/health`, { cache: "no-store" });
        if (!cancelled && res.ok) {
          setBackendUnreachable(false);
          setCheckingBackend(false);
          clearInterval(interval);
        }
      } catch {
        // Still blocked — keep polling
      }
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Derive what to show as the login error (not the network probe error)
  const displayError = internalError || (backendUnreachable ? null : externalError);

  const errorMessage = (
    typeof displayError === "string" ? displayError : displayError?.message || ""
  ).toLowerCase();

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setInternalError(null);

    try {
      await onLogin(email, password);
    } catch (err) {
      setInternalError(err);
    } finally {
      setLoading(false);
    }
  }

  const isInvalid = errorMessage.includes("invalid");

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
          <div>
            <SentrixLogo inverse />
          </div>

          <div className="my-auto py-6">
            <h1 className="max-w-md text-3xl font-bold leading-tight tracking-normal sm:text-4xl">
              Secure lab monitoring starts here.
            </h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-slate-300 sm:text-base">
              Sign in to manage registered devices, live health metrics, and
              network discovery from one focused console.
            </p>

            {/* Interactive Feature Icons & Dynamic Info Box */}
            <div
              className="mt-8 max-w-md"
              onMouseLeave={() => setIsPaused(false)}
            >
              <div className="flex items-center gap-3">
                {features.map((feat, idx) => {
                  const Icon = feat.icon;
                  const isActive = activeIndex === idx;
                  return (
                    <button
                      key={feat.title}
                      type="button"
                      onMouseEnter={() => {
                        setActiveIndex(idx);
                        setIsPaused(true);
                      }}
                      onClick={() => {
                        setActiveIndex(idx);
                        setIsPaused(true);
                      }}
                      className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border transition-colors duration-200 ${
                        isActive
                          ? `${feat.color}`
                          : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
                      }`}
                      title={feat.title}
                    >
                      <Icon size={20} />
                    </button>
                  );
                })}
              </div>

              {/* Dynamic Info Box with Butter-Smooth Fade & Slide per Feature */}
              <div className="mt-3 min-h-[72px]">
                <div className="rounded-2xl rounded-tl-sm border border-white/10 bg-white/5 p-3.5 backdrop-blur-sm">
                  <div
                    key={activeIndex}
                    className="min-h-[44px] animate-in fade-in slide-in-from-bottom-1 duration-300"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">
                        {features[activeIndex]?.title || ""}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-slate-300">
                      {features[activeIndex]?.description || ""}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-6">
            <p className="text-[11px] font-medium tracking-wide text-slate-400">
              © 2026 Sentrix Labs
            </p>
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

              {/* Show backend authorization banner when backend is unreachable */}
              {backendUnreachable && (
                <LoginAlert error={{ message: "Failed to fetch" }} />
              )}

              {/* Show login errors only when backend IS reachable */}
              {!backendUnreachable && <LoginAlert error={displayError} />}

              <button
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition hover:bg-slate-900 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                type="submit"
                disabled={loading || backendUnreachable || checkingBackend}
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <SentrixLogoLoader compact />
                    Signing in...
                  </span>
                ) : checkingBackend ? (
                  <span className="inline-flex items-center gap-2">
                    <SentrixLogoLoader compact />
                    Checking connection...
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
