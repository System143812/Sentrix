import { Boxes, Laptop, Wifi, WifiOff } from "lucide-react";
import { useMemo, useState } from "react";
import { DeviceTable } from "../components/DeviceTable.jsx";
import { GroupPanel } from "../components/GroupPanel.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Card } from "../components/Card.jsx";
import { SearchFilterBar } from "../components/SearchFilterBar.jsx";
import { matchesSearch } from "../shared/utils.js";
import { ICON_TONES } from "../styles/tones.js";

function SummaryCard({ label, value, icon: Icon, tone = "blue" }) {
  return (
    <Card padding="0" className="group relative overflow-hidden border-slate-200/60 bg-white transition-all duration-300 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-200/50">
      <div className="flex items-center min-h-[100px]">
        <div className="flex flex-1 items-center justify-between p-5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">
              {label}
            </p>
            <div className="flex items-baseline gap-1.5">
              <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                {value}
              </p>
              <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">units</span>
            </div>
          </div>
          
          <div className={`rounded-xl border p-3 transition-all duration-300 group-hover:scale-110 shadow-sm ${ICON_TONES[tone] || ICON_TONES.blue}`}>
            <Icon size={24} strokeWidth={2.5} />
          </div>
        </div>
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
  canControl = false,
}) {
  const [query, setQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("all");
  const devices = dashboardData.clients || [];
  const groupOptions = useMemo(
    () => ["all", ...new Set(devices.map((device) => device.group || "Unassigned"))],
    [devices],
  );
  const filteredDevices = useMemo(
    () =>
      devices.filter((device) => {
        const groupMatch = selectedGroup === "all" || (device.group || "Unassigned") === selectedGroup;
        return groupMatch && matchesSearch(device, query, ["hostname", "os", "ip", "mac", "group", "status"]);
      }),
    [devices, query, selectedGroup],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Laptop}
        title="Device lifecycle management for school labs"
        subtitle={`Signed in as ${user?.email}. Monitor, discover, organize, and prepare agent deployment from one console.`}
        backgroundImage="/home_header.jpg"
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
        <div className="w-full sm:flex-1 lg:max-w-[280px]">
          <SummaryCard label="Total registered" value={dashboardData.total} icon={Boxes} />
        </div>
        <div className="w-full sm:flex-1 lg:max-w-[280px]">
          <SummaryCard label="Online" value={dashboardData.online} icon={Wifi} tone="emerald" />
        </div>
        <div className="w-full sm:flex-1 lg:max-w-[280px]">
          <SummaryCard label="Offline" value={dashboardData.offline} icon={WifiOff} tone="rose" />
        </div>
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

          <SearchFilterBar
            className="mb-4"
            count={filteredDevices.length}
            filters={[
              {
                id: "group",
                label: "Group",
                value: selectedGroup,
                onChange: setSelectedGroup,
                options: groupOptions.map((group) => ({
                  value: group,
                  label: group === "all" ? "All groups" : group,
                })),
              },
            ]}
            onQueryChange={setQuery}
            placeholder="Search devices by name, IP, MAC, group, or status"
            query={query}
          />

          <DeviceTable
            devices={filteredDevices}
            loading={loading}
            onUpdateGroup={onUpdateGroup}
            groups={groups}
            onArchive={onArchive}
            canControl={canControl}
          />
        </div>

        <GroupPanel devices={devices} />
      </div>
    </div>
  );
}
