import { SentrixMark } from "./SentrixLogo.jsx";

/**
 * A modern, minimal loader for detail views.
 * Uses the Sentrix logo animation in black for high contrast.
 * 
 * @param {string} title - Primary loading message
 * @param {string} subtitle - Supporting technical details
 * @param {boolean} fill - Whether to take up full container height
 */
export function DetailLoader({ title, subtitle, fill = false }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center animate-in fade-in duration-500 ${fill ? 'h-full min-h-[300px]' : 'py-20'}`}>
      <div className="relative mb-6">
        {/* Subtle ping effect for depth, no solid background */}
        <div className="absolute inset-0 animate-ping rounded-full bg-slate-200 opacity-20" />
        <div className="relative flex h-16 w-16 items-center justify-center text-slate-950">
          <SentrixMark className="h-14 w-14" loading />
        </div>
      </div>
      
      {title && (
        <h5 className="text-sm font-semibold uppercase tracking-wider text-slate-800 font-ui">
          {title}
        </h5>
      )}
      
      {subtitle && (
        <p className="mt-2 text-xs font-medium text-slate-400 max-w-[280px] leading-relaxed">
          {subtitle}
        </p>
      )}
    </div>
  );
}

/**
 * A refresh overlay using the minimal logo loader.
 * Used when data is being updated in the background.
 */
export function DetailRefreshOverlay({ title = "Refreshing", subtitle = "Syncing live data..." }) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center rounded-lg bg-white/60 backdrop-blur-[2px] transition-all overflow-hidden border border-slate-100/50">
      <div className="flex flex-col items-center gap-4 p-8">
        <div className="text-slate-950">
          <SentrixMark className="h-10 w-10" loading />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-slate-900">{title}</p>
          <p className="mt-1 text-[10px] font-medium text-slate-400 uppercase tracking-tight">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
