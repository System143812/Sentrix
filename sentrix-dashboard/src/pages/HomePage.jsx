import { Activity, Laptop, Radio, ShieldCheck, Users, Layers, AlertCircle } from "lucide-react";
import { DeviceTable } from "../components/DeviceTable.jsx";
import { GroupPanel } from "../components/GroupPanel.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Card } from "../components/Card.jsx";

function SummaryCard({ label, value, icon: Icon, tone = "blue", description }) {
  const tones = {
    blue: "text-blue-600 bg-blue-50 border-blue-100",
    emerald: "text-emerald-600 bg-emerald-50 border-emerald-100",
    rose: "text-rose-600 bg-rose-50 border-rose-100",
  };

  return (
    <Card padding="0" className="relative overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 group bg-white border-slate-200/60">
      <div className="relative p-6">
        <div className="flex items-center justify-between gap-3 mb-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-ui">{label}</p>
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border shadow-sm transition-transform group-hover:scale-105 ${tones[tone]}`}>
            <Icon size={18} strokeWidth={2.5} />
          </span>
        </div>
        <strong className="text-3xl font-bold tracking-tight text-slate-900 font-data">{value}</strong>
        <p className="mt-2 text-[11px] font-medium text-slate-400 italic leading-relaxed">
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
        subtitle={`Welcome back, ${user?.email?.split('@')[0]}. Monitoring ${dashboardData.total || 0} active laboratory terminals.`}
        backgroundImage="/home_header.jpg"
      />

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard 
          label="Inventory" 
          value={dashboardData.total} 
          icon={Laptop} 
          description="Total provisioned terminal endpoints"
        />
        <SummaryCard 
          label="Connectivity" 
          value={dashboardData.online} 
          icon={Radio} 
          tone="emerald"
          description="Nodes actively streaming telemetry"
        />
        <SummaryCard 
          label="Incidents" 
          value={dashboardData.offline} 
          icon={AlertCircle} 
          tone="rose"
          description="Terminals awaiting re-synchronization"
        />
      </div>

      <div className="space-y-8">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 px-1">
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-3 font-ui">
                <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                Registered Device Fleet
              </h2>
              <p className="mt-1 text-[11px] font-bold text-slate-400 uppercase tracking-widest font-ui">
                Real-time technical specifications and health metrics
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

        <div className="pt-4">
          <div className="mb-6 px-1">
            <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-3 font-ui">
              <div className="h-1.5 w-1.5 rounded-full bg-teal-500" />
              Administrative Clusters
            </h2>
            <p className="mt-1 text-[11px] font-bold text-slate-400 uppercase tracking-widest font-ui">
              Topological distribution by physical location
            </p>
          </div>
          <GroupPanel devices={dashboardData.clients || []} />
        </div>
      </div>
    </div>
  );
}
