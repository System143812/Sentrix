export function Card({ children, padding = "4", className = "" }) {
  const paddingClasses = {
    "0": "p-0",
    "3": "p-3",
    "4": "p-4",
    "5": "p-5",
    "6": "p-6",
  };
  const paddingClass = paddingClasses[padding] || paddingClasses["4"];

  return (
    <div className={`rounded-lg border border-line bg-white ${paddingClass} shadow-sm ${className}`}>
      {children}
    </div>
  );
}
