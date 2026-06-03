import { Check, X } from "lucide-react";

export function PasswordValidator({ password }) {
  const requirements = [
    { label: "At least 8 characters", test: (p) => p.length >= 8 },
    { label: "At least one uppercase letter", test: (p) => /[A-Z]/.test(p) },
    { label: "At least one lowercase letter", test: (p) => /[a-z]/.test(p) },
    { label: "At least one number", test: (p) => /[0-9]/.test(p) },
    { label: "At least one special character", test: (p) => /[^A-Za-z0-9]/.test(p) },
  ];

  if (!password) return null;

  return (
    <div className="mt-3 grid gap-2 rounded-lg border border-slate-100 bg-slate-50/50 p-4 shadow-inner">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Security Strength</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {requirements.map((req, index) => {
          const met = req.test(password);
          return (
            <div key={index} className="flex items-center gap-2">
              <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${met ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-400"}`}>
                {met ? <Check size={10} strokeWidth={4} /> : <X size={10} strokeWidth={4} />}
              </div>
              <span className={`text-[11px] font-medium ${met ? "text-emerald-700" : "text-slate-500"}`}>
                {req.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function validatePassword(password) {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}
