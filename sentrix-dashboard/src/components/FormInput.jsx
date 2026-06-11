import { Dices, Eye, EyeOff } from "lucide-react";
import { useState } from "react";

export function FormInput({
  label,
  type = "text",
  name,
  value,
  onChange,
  onBlur,
  placeholder = "",
  error = "",
  disabled = false,
  required = false,
  autoComplete = "off",
  className = "",
  containerClassName = "",
  icon: Icon = null,
  onGenerate = null,
}) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword ? (showPassword ? "text" : "password") : type;

  return (
    <div className={`w-full ${containerClassName}`}>
      {label && (
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <div className="relative flex items-center">
        {Icon && (
          <div className="absolute left-3 flex items-center pointer-events-none text-slate-400">
            <Icon size={18} />
          </div>
        )}
        <input
          type={inputType}
          name={name}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          autoComplete={autoComplete}
          aria-label={label}
          aria-describedby={error ? `${name}-error` : undefined}
          className={`h-11 w-full rounded-lg border border-line bg-slate-50 px-3 text-sm outline-none transition focus:border-slate-950 focus:ring-4 focus:ring-slate-950/5 disabled:opacity-50 ${
            error ? "border-red-500 focus:border-red-500 focus:ring-red-100" : ""
          } ${Icon ? "pl-10" : ""} ${isPassword && onGenerate ? "pr-20" : isPassword ? "pr-10" : ""} ${className}`}
        />
        {isPassword && onGenerate && (
          <button
            type="button"
            title="Generate a random password"
            className="absolute right-10 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-500 transition"
            onClick={onGenerate}
            tabIndex="-1"
          >
            <Dices size={18} />
          </button>
        )}
        {isPassword && (
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
            onClick={() => setShowPassword(!showPassword)}
            tabIndex="-1"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
      {error && (
        <p id={`${name}-error`} className="mt-1.5 text-[11px] font-bold uppercase tracking-wider text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
