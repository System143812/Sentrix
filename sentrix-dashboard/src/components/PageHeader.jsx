import { Card } from "./Card.jsx";

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  action = null,
  children = null,
  backgroundImage = null,
  dark = false,
}) {
  const isDark = dark || Boolean(backgroundImage);

  return (
    <Card
      padding="0"
      className={`relative overflow-hidden shadow-sm transition-all duration-300 ${
        backgroundImage ? "border-none bg-slate-900" : ""
      }`}
    >
      {backgroundImage ? (
        <div
          className="absolute inset-0 z-0 bg-cover bg-center transition-transform duration-700 hover:scale-[1.02]"
          style={{
            backgroundImage: `linear-gradient(to bottom right, rgba(2, 6, 23, 0.9), rgba(15, 23, 42, 0.75)), url("${backgroundImage}")`,
          }}
        />
      ) : null}

      <div className={`relative z-10 p-6 ${isDark ? "text-white" : ""}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              {Icon ? (
                <Icon
                  size={20}
                  strokeWidth={2}
                  className={isDark ? "text-blue-300" : "text-blue-600"}
                />
              ) : null}
              <h2
                className={`text-xl font-semibold tracking-tight ${
                  isDark ? "text-white" : "text-slate-900"
                }`}
              >
                {title}
              </h2>
            </div>
            {subtitle ? (
              <div
                className={`mt-1.5 max-w-3xl text-sm leading-6 ${
                  isDark ? "font-medium text-slate-300/90" : "text-slate-500"
                }`}
              >
                {subtitle}
              </div>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
        {children ? (
          <div
            className={`mt-5 ${
              isDark
                ? "border-t border-white/10 pt-5"
                : "border-t border-slate-200/60 pt-5"
            }`}
          >
            {children}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
