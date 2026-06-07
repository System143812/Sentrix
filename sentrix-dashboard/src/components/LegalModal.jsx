import { X } from "lucide-react";

export function LegalModal({ isOpen, onClose, content }) {
  if (!isOpen || !content) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 lg:p-8">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity animate-in fade-in duration-300"
        onClick={onClose}
      />
      
      {/* Modal Container */}
      <div className="relative flex flex-col w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header - Sticky */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5 sm:px-8">
          <div>
            <h3 className="text-xl font-bold text-slate-900">
              {content.title}
            </h3>
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mt-1">
              Sentrix Official Documentation
            </p>
          </div>
          <button
            onClick={onClose}
            className="group -mr-2 rounded-xl p-2.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all active:scale-95"
          >
            <X size={22} className="transition-transform duration-300 group-hover:rotate-90" />
          </button>
        </div>

        {/* Content Area - Scrollable with proper padding */}
        <div className="flex-1 overflow-y-auto px-6 py-8 sm:px-10 sm:py-10 scrollbar-thin scrollbar-thumb-slate-200 scroll-smooth">
          <div className="space-y-10">
            {content.sections.map((section, index) => (
              <div key={index} className="space-y-4 group">
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-1 bg-ocean/20 rounded-full group-hover:bg-ocean transition-colors duration-300" />
                  <h4 className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-ocean">
                    {section.heading}
                  </h4>
                </div>
                <p className="text-sm leading-relaxed text-slate-600 sm:text-base sm:leading-8">
                  {section.content}
                </p>
              </div>
            ))}
          </div>
          
          {/* Subtle bottom padding/spacer to ensure last section isn't cramped */}
          <div className="h-4" />
        </div>

        {/* Footer - Sticky */}
        <div className="border-t border-slate-50 bg-slate-50/80 backdrop-blur-sm px-6 py-5 sm:px-8 flex justify-end items-center gap-4">
          <span className="hidden sm:block text-[10px] text-slate-400 font-medium">
            Please read these documents carefully.
          </span>
          <button
            onClick={onClose}
            className="w-full sm:w-auto rounded-xl bg-slate-950 px-8 py-3 text-sm font-bold text-white shadow-xl shadow-slate-900/20 transition-all hover:bg-slate-800 active:scale-[0.97]"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
}
