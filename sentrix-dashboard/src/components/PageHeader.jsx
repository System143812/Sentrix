import { Card } from "./Card.jsx";

export function PageHeader({ icon: Icon, title, subtitle, action = null, children = null }) {
  return (
    <Card padding="6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {Icon ? <Icon size={20} className="text-ocean" /> : null}
            <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          </div>
          {subtitle && <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </Card>
  );
}
