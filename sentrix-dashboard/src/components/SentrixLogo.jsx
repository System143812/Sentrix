export function SentrixMark({ className = "", loading = false }) {
  return (
    <svg
      className={`${loading ? "sentrix-logo-loader" : ""} ${className}`}
      viewBox="0 0 96 72"
      role="img"
      aria-label="Sentrix shield logo"
    >
      <path
        className="sentrix-logo-draw"
        d="M48 5 76 17v18c0 17-11 27-28 33-17-6-28-16-28-33V17L48 5Z"
        fill="none"
        pathLength="1"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="5"
      />
      <path
        className="sentrix-logo-fill"
        d="M48 14 68 22v14c0 11-7 19-20 24-13-5-20-13-20-24V22l20-8Z"
        fill="currentColor"
        opacity="0.12"
      />
      <path
        className="sentrix-logo-draw sentrix-logo-delay"
        d="M8 27h24c8 0 10-9 16-9s8 9 16 9h24"
        fill="none"
        pathLength="1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="4"
      />
      <path
        className="sentrix-logo-draw sentrix-logo-delay"
        d="M8 45h24c8 0 10 9 16 9s8-9 16-9h24"
        fill="none"
        pathLength="1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="4"
      />
      <path
        className="sentrix-logo-draw"
        d="M48 21v30M39 27v18M57 27v18"
        fill="none"
        pathLength="1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="3"
      />
      <rect
        className="sentrix-logo-node"
        fill="currentColor"
        height="12"
        rx="3"
        width="10"
        x="43"
        y="31"
      />
      <rect fill="currentColor" height="6" rx="1.5" width="9" x="82" y="17" />
      <rect fill="currentColor" height="6" rx="1.5" width="9" x="82" y="33" />
      <rect fill="currentColor" height="6" rx="1.5" width="9" x="82" y="49" />
    </svg>
  );
}

const logoSizes = {
  sm: {
    shell: "h-9 w-9",
    mark: "h-6 w-6",
    title: "text-base",
  },
  md: {
    shell: "h-11 w-11",
    mark: "h-8 w-8",
    title: "text-lg",
  },
  lg: {
    shell: "h-14 w-14",
    mark: "h-10 w-10",
    title: "text-xl",
  },
};

const logoTones = {
  slate: "border-slate-200 bg-slate-50/90 text-slate-950 ring-slate-900/5",
  white: "border-white/15 bg-white/10 text-white ring-white/20",
  transparent: "border-transparent bg-transparent text-slate-950 ring-transparent shadow-none",
};

export function SentrixLogo({
  compact = false,
  inverse = false,
  framed = true,
  size = "md",
  tone = "slate",
}) {
  const logoSize = logoSizes[size] || logoSizes.md;
  const logoTone = inverse ? logoTones.white : logoTones[tone] || logoTones.slate;
  const frameClass = framed
    ? `grid ${logoSize.shell} place-items-center rounded-lg border shadow-sm ring-1 ${logoTone}`
    : `grid ${logoSize.shell} place-items-center ${inverse ? "text-white" : "text-slate-950"}`;

  return (
    <div className="flex items-center gap-3">
      <span className={frameClass}>
        <SentrixMark className={logoSize.mark} />
      </span>
      {!compact ? (
        <div>
          <p
            className={`${logoSize.title} font-black leading-none tracking-normal ${
              inverse ? "text-white" : "text-ink"
            }`}
          >
            Sentrix
          </p>
          <p
            className={`mt-1 text-xs font-semibold uppercase tracking-wide ${
              inverse ? "text-slate-300" : "text-slate-500"
            }`}
          >
            Device Management
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function SentrixLogoLoader({ label = "Loading", compact = false }) {
  if (compact) {
    return (
      <span className="grid h-6 w-6 place-items-center text-current">
        <SentrixMark className="h-6 w-6" loading />
      </span>
    );
  }

  return (
    <div className="grid place-items-center gap-3 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-xl border border-slate-200 bg-white text-slate-900 shadow-lg shadow-slate-300 ring-1 ring-slate-900/5">
        <SentrixMark className="h-12 w-12" loading />
      </span>
      {label ? <p className="text-sm font-semibold text-slate-700">{label}</p> : null}
    </div>
  );
}
