import { AlertCircle, Laptop, Radio } from "lucide-react";
import { DeviceTable } from "../components/DeviceTable.jsx";
import { GroupPanel } from "../components/GroupPanel.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Card } from "../components/Card.jsx";

function SummaryCard({ label, value, icon: Icon, tone = "blue" }) {
  const tones = {
    blue: "border-blue-100 bg-blue-50 text-blue-600",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-600",
    rose: "border-rose-100 bg-rose-50 text-rose-600",
  };

  return (
    <Card padding="0" className="group overflow-hidden border-slate-200/70 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <div className="p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {label}
          </p>
          <span className={`grid h-10 w-10 place-items-center rounded-xl border shadow-sm transition group-hover:scale-105 ${tones[tone]}`}>
            <Icon size={18} strokeWidth={2.5} />
          </span>
        </div>
        <p className="text-3xl font-bold tracking-tight text-slate-900">
          {value}
        </p>
      </div>
    </Card>
  );
}

export function HomePage({
  user,
  dashboardData,
  loading,
  onUpdateGroup,
  groups,
  onArchive,
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Device lifecycle management for school labs"
        subtitle={`Signed in as ${user?.email}. Monitor, discover, organize, and prepare agent deployment from one console.`}
        backgroundImage="/home_header.jpg"
      />

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard label="Total registered" value={dashboardData.total} icon={Laptop} />
        <SummaryCard label="Online" value={dashboardData.online} icon={Radio} tone="emerald" />
        <SummaryCard label="Offline" value={dashboardData.offline} icon={AlertCircle} tone="rose" />
      </div>

      <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Registered devices</h2>
              <p className="text-sm text-slate-500">
                Expand a device row to review specs, peripherals, and current
                metrics.
              </p>
            </div>
          </div>

          <DeviceTable
            devices={dashboardData.clients || []}
            loading={loading}
            onUpdateGroup={onUpdateGroup}
            groups={groups}
            onArchive={onArchive}
          />
        </div>

        <GroupPanel devices={dashboardData.clients || []} />
      </div>
    </div>
  );
}
