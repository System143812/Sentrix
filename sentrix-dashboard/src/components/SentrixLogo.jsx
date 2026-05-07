import { Activity, Radar } from "lucide-react";

export function SentrixLogo({ compact = false, inverse = false }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`relative grid h-12 w-12 place-items-center rounded-[18px] text-white shadow-md shadow-slate-900/10 ring-1 ring-white/40 ${
          inverse ? "bg-white/10" : "bg-ink"
        }`}
      >
        <span className="absolute inset-1 rounded-[14px] border border-white/15" />
        <Radar className="relative text-white" size={23} strokeWidth={2.4} />
        <Activity
          className="absolute -bottom-1 -right-1 rounded-lg bg-ocean p-1 text-white ring-2 ring-white"
          size={22}
          strokeWidth={2.6}
        />
      </span>
      {!compact ? (
        <div>
          <p
            className={`text-lg font-black leading-none tracking-normal ${
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
            LabOps Console
          </p>
        </div>
      ) : null}
    </div>
  );
}
