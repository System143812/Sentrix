import { Activity, Laptop, Radio, ShieldCheck, Users, Layers, AlertCircle } from "lucide-react";
import { DeviceTable } from "../components/DeviceTable.jsx";
import { GroupPanel } from "../components/GroupPanel.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Card } from "../components/Card.jsx";

function SummaryCard({ label, value, icon: Icon, tone = "blue", description }) {
  const tones = {
    blue: "from-blue-500/5 to-transparent text-blue-700 border-blue-100",
    emerald: "from-emerald-500/5 to-transparent text-emerald-700 border-emerald-100",
    rose: "from-rose-500/5 to-transparent text-rose-700 border-rose-100",
  };

  return (
    <Card padding="0" className="relative overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 group">
      <div className={`absolute inset-0 bg-gradient-to-br ${tones[tone].split(' ')[0]}`} />
      <div className="relative p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</p>
          <span className={`p-2 rounded-lg border shadow-sm transition-transform group-hover:scale-110 ${tones[tone].split(' ').slice(1).join(' ')}`}>
            <Icon size={18} strokeWidth={2.5} />
          </span>
        </div>
        <strong className="text-3xl font-bold tracking-tight text-slate-950">{value}</strong>
        <p className="mt-1 text-[11px] font-medium text-slate-400 italic">
          {description}
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
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        icon={Activity}
        title="Fleet Overview"
        subtitle={`Welcome back, ${user?.email?.split('@')[0]}. You are currently monitoring ${dashboardData.total || 0} active laboratory terminals.`}
        backgroundImage="/home_header.jpg"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard 
          label="Total Registered" 
          value={dashboardData.total} 
          icon={Laptop} 
          description="Unique agents in database"
        />
        <SummaryCard 
          label="Online Now" 
          value={dashboardData.online} 
          icon={Radio} 
          tone="emerald"
          description="Currently streaming telemetry"
        />
        <SummaryCard 
          label="Disconnected" 
          value={dashboardData.offline} 
          icon={AlertCircle} 
          tone="rose"
          description="Require manual review"
        />
      </div>

      <div className="space-y-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <ShieldCheck className="text-ocean" size={20} />
                Registered Device Fleet
              </h2>
              <p className="text-sm font-medium text-slate-500">
                Detailed real-time metrics and system health indicators.
              </p>
            </div>
          </div>

          <div className="min-w-0 w-full">
            <DeviceTable
              devices={dashboardData.clients || []}
              loading={loading}
              onUpdateGroup={onUpdateGroup}
              groups={groups}
              onArchive={onArchive}
            />
          </div>
        </div>

        <div className="pt-2">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Layers className="text-teal-600" size={20} />
              Laboratory Groupings
            </h2>
            <p className="text-sm font-medium text-slate-500">
              Distribution of devices across physical locations.
            </p>
          </div>
          <GroupPanel devices={dashboardData.clients || []} />
        </div>
      </div>
    </div>
  );
}
