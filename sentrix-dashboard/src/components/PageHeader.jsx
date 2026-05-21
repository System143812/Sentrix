import { Card } from "./Card.jsx";

export function PageHeader({ 
  icon: Icon, 
  title, 
  subtitle, 
  action = null, 
  children = null,
  backgroundImage = null,
  dark = false
}) {
  const isDark = dark || !!backgroundImage;

  return (
    <Card padding="0" className={`relative overflow-hidden shadow-md transition-all duration-500 ${backgroundImage ? 'border-none bg-slate-900' : ''}`}>
      {backgroundImage && (
        <div 
          className="absolute inset-0 z-0 bg-cover bg-center transition-transform duration-1000 hover:scale-105" 
          style={{ 
            backgroundImage: `linear-gradient(to bottom right, rgba(2, 6, 23, 0.75), rgba(15, 23, 42, 0.55), rgba(30, 58, 138, 0.3)), url("${backgroundImage}")` 
          }}
        />
      )}

      <div className={`relative z-10 p-6 ${isDark ? 'text-white' : ''}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {Icon ? <Icon size={22} className={isDark ? "text-blue-400" : "text-ocean"} strokeWidth={2.5} /> : null}
              <h2 className={`text-xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>{title}</h2>
            </div>
            {subtitle && (
              <p className={`mt-2 max-w-3xl text-sm leading-6 ${isDark ? 'text-slate-300 font-medium' : 'text-slate-500'}`}>
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
        {children ? <div className={`mt-5 ${isDark ? 'border-t border-white/10 pt-5' : ''}`}>{children}</div> : null}
      </div>
    </Card>
  );
}

