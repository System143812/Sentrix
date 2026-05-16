// Reusable form input component with consistent styling, error handling, and accessibility

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
}) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-slate-700 mb-2">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <input
        type={type}
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
        className={`h-11 w-full rounded-md border border-line bg-slate-50 px-3 text-sm outline-none focus:border-signal focus:ring-2 focus:ring-blue-100 disabled:opacity-50 ${
          error ? "border-red-500 focus:border-red-500 focus:ring-red-100" : ""
        } ${className}`}
      />
      {error && (
        <p id={`${name}-error`} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
