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

      <div className={`relative z-10 p-6 sm:p-8 ${isDark ? 'text-white' : ''}`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              {Icon ? <Icon size={20} className={isDark ? "text-blue-400" : "text-blue-600"} strokeWidth={2} /> : null}
              <h2 className={`text-xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'} font-ui`}>{title}</h2>
            </div>
            {subtitle && (
              <p className={`mt-2 max-w-3xl text-sm leading-relaxed ${isDark ? 'text-slate-300 font-medium' : 'text-slate-500'}`}>
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="shrink-0 flex items-center">{action}</div>}
        </div>
        {children ? <div className={`mt-6 ${isDark ? 'border-t border-white/5 pt-6' : 'border-t border-slate-100 pt-6'}`}>{children}</div> : null}
      </div>
    </Card>
  );
}

