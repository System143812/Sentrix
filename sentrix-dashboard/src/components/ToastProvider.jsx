import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleX, Info, X } from "lucide-react";
import { generateId } from "../shared/utils";

const ToastContext = createContext(null);

const toastStyles = {
  default: {
    icon: Info,
    classes: "border-blue-200 bg-blue-50 text-blue-900",
    iconClasses: "bg-blue-100 text-blue-600",
  },
  warning: {
    icon: AlertTriangle,
    classes: "border-amber-200 bg-amber-50 text-amber-900",
    iconClasses: "bg-amber-100 text-amber-600",
  },
  success: {
    icon: CheckCircle2,
    classes: "border-emerald-200 bg-emerald-50 text-emerald-900",
    iconClasses: "bg-emerald-100 text-emerald-600",
  },
  failed: {
    icon: CircleX,
    classes: "border-rose-200 bg-rose-50 text-rose-900",
    iconClasses: "bg-rose-100 text-rose-600",
  },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback((message, type = "default", options = {}) => {
    const id = generateId();
    const nextToast = {
      id,
      type: toastStyles[type] ? type : "default",
      title: options.title,
      message,
    };

    setToasts((current) => [nextToast, ...current].slice(0, 4));

    window.setTimeout(() => {
      removeToast(id);
    }, options.duration || 5200);
  }, [removeToast]);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[70] grid w-[calc(100%-2.5rem)] max-w-sm gap-3">
        {toasts.map((toast) => {
          const style = toastStyles[toast.type] || toastStyles.default;
          const Icon = style.icon;

          return (
            <div
              className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-4 shadow-2xl shadow-slate-900/10 ring-1 ring-white/60 backdrop-blur-md ${style.classes}`}
              key={toast.id}
              role="status"
            >
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${style.iconClasses}`}>
                <Icon size={18} strokeWidth={2.5} />
              </span>
              <div className="min-w-0 flex-1">
                {toast.title ? (
                  <p className="text-sm font-bold leading-5">{toast.title}</p>
                ) : null}
                <p className="text-sm font-semibold leading-5">{toast.message}</p>
              </div>
              <button
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-current opacity-60 transition hover:bg-white/50 hover:opacity-100"
                onClick={() => removeToast(toast.id)}
                type="button"
                aria-label="Dismiss notification"
              >
                <X size={15} strokeWidth={2.5} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    return {
      notify: () => {},
    };
  }

  return context;
}
