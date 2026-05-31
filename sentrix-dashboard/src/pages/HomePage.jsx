import { Monitor, Activity, WifiOff, Plug, Unplug, UserCircle } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { DeviceTable } from "../components/DeviceTable.jsx";
import { GroupPanel } from "../components/GroupPanel.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Card } from "../components/Card.jsx";
import { SearchFilterBar } from "../components/SearchFilterBar.jsx";
import { matchesSearch } from "../shared/utils.js";
import { ICON_TONES } from "../styles/tones.js";

function SummaryCard({ label, value, icon: Icon, tone = "blue", subValue }) {
  return (
    <Card padding="0" className="relative overflow-hidden border-slate-200/60 bg-white">
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
              {subValue && (
                <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">{subValue}</span>
              )}
            </div>
          </div>
          
          <div className={`rounded-xl border p-3 shadow-sm ${ICON_TONES[tone] || ICON_TONES.blue}`}>
            <Icon size={24} strokeWidth={2.5} />
          </div>
        </div>
      </div>
    </Card>
  );
}

const HOME_TIPS = [
  "Use the Broadcast tool to send urgent notifications to students across the lab.",
  "You can target entire groups for remote actions like Shutdown or Restart.",
  "Check the Analytics tab to monitor software usage and identify common assets.",
  "Network Intelligence helps you track real-time and historical domain interactions on any device.",
  "Device peripherals are tracked automatically; check the Logs for security alerts.",
  "Archive devices you no longer use to keep your registered list clean.",
  "The 'Sync' button forces a real-time update of all connected device metrics.",
  "Use 'System Purge' to quickly clear temporary files and speed up lab PCs.",
  "Organize devices by lab room using the Group assignment selector.",
  "Look for the 'Live' indicator to confirm a device is reachable for remote commands.",
];

export function HomePage({
  user,
  dashboardData,
  loading,
  onUpdateGroup,
  groups,
  onArchive,
  canControl = false,
  canManagePeripherals = false,
}) {
  const [query, setQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [tipIndex, setTipIndex] = useState(0);
  const devices = dashboardData.clients || [];
  const missingCount = dashboardData.missingPeripherals || 0;

  useEffect(() => {
    // Initial random start
    setTipIndex(Math.floor(Math.random() * HOME_TIPS.length));
    
    const interval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % HOME_TIPS.length);
    }, 10000); // Sync with CSS animation duration (10s)
    
    return () => clearInterval(interval);
  }, []);

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
    <div className="page-reveal space-y-6">
      <PageHeader
        title={`Welcome back, ${user?.email?.split('@')[0] || 'Admin'}!`}
        subtitle={
          <div className="min-h-[1.5rem]">
            <p className="animate-tip-cycle" key={tipIndex}>
              <span className="font-bold text-blue-400 mr-2">Tip:</span>
              {HOME_TIPS[tipIndex]}
            </p>
          </div>
        }
        backgroundImage="/home_header.jpg"
        action={
          <span className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-300 backdrop-blur-md border border-white/10 shadow-lg">
            <UserCircle size={14} strokeWidth={2.5} className="text-blue-400" />
            {user?.email}
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Total registered" value={dashboardData.total} icon={Monitor} subValue="units" />
        <SummaryCard label="Online" value={dashboardData.online} icon={Activity} tone="emerald" subValue="active" />
        <SummaryCard label="Offline" value={dashboardData.offline} icon={WifiOff} tone="rose" subValue="disconnected" />
        <SummaryCard 
          label="Peripherals" 
          value={missingCount > 0 ? missingCount : "Secure"} 
          icon={missingCount > 0 ? Unplug : Plug} 
          tone={missingCount > 0 ? "rose" : "emerald"}
          subValue={missingCount > 0 ? "missing" : "verified"}
        />
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
            canManagePeripherals={canManagePeripherals}
          />
        </div>

        <GroupPanel devices={devices} />
      </div>
    </div>
  );
}
