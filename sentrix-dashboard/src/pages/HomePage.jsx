import {
  Monitor,
  Activity,
  WifiOff,
  Unplug,
  UserCircle,
  X,
} from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { DeviceTable } from "../components/DeviceTable.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { SearchFilterBar } from "../components/SearchFilterBar.jsx";
import { matchesSearch } from "../shared/utils.js";

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
  refresh,
}) {
  const [query, setQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [tipIndex, setTipIndex] = useState(0);
  const [statusFilters, setStatusFilters] = useState({
    online: false,
    offline: false,
    missingPeripherals: false,
  });

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

  const toggleStatusFilter = (key) => {
    setStatusFilters((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const groupOptions = useMemo(
    () => [
      "all",
      ...new Set(devices.map((device) => device.group || "Unassigned")),
    ],
    [devices],
  );

  const filteredDevices = useMemo(
    () =>
      devices.filter((device) => {
        const groupMatch =
          selectedGroup === "all" ||
          (device.group || "Unassigned") === selectedGroup;

        const activeStatusFilters = Object.entries(statusFilters)
          .filter(([_, active]) => active)
          .map(([key]) => key);

        const statusMatch =
          activeStatusFilters.length === 0 ||
          activeStatusFilters.some((filterKey) => {
            if (filterKey === "online") return device.status === "online";
            if (filterKey === "offline") return device.status === "offline";
            if (filterKey === "missingPeripherals") {
              return (
                (device.missingPeripherals || 0) > 0 ||
                (device.details?.missingPeripherals || 0) > 0
              );
            }
            return false;
          });

        return (
          groupMatch &&
          statusMatch &&
          matchesSearch(device, query, [
            "hostname",
            "os",
            "ip",
            "mac",
            "group",
            "status",
          ])
        );
      }),
    [devices, query, selectedGroup, statusFilters],
  );

  return (
    <div className="page-reveal space-y-6">
      <PageHeader
        title={`Welcome back, ${user?.email?.split("@")[0] || "Admin"}!`}
        subtitle={
          <div className="min-h-[1.5rem]">
            <p className="animate-tip-cycle" key={tipIndex}>
              <span className="font-bold mr-2">Tip:</span>
              {HOME_TIPS[tipIndex]}
            </p>
          </div>
        }
        backgroundImage="/home_header.jpg"
      />

      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Registered devices</h2>
            <p className="text-sm text-slate-500">
              Expand a device row to review specs, peripherals, and current
              metrics.
            </p>
          </div>

          {/* Filter Badges on the very right with increased padding */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => toggleStatusFilter("online")}
              type="button"
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold transition-all shadow-2xs cursor-pointer border ${
                statusFilters.online
                  ? "bg-emerald-100/70 text-emerald-900 border-transparent font-bold shadow-2xs"
                  : "bg-slate-100 text-slate-600 border-transparent hover:bg-slate-200/70 hover:text-slate-800"
              }`}
            >
              <Activity
                size={14}
                className="text-emerald-600"
              />
              <span>Online ({dashboardData.online ?? 0})</span>
              {statusFilters.online && (
                <X size={14} className="ml-1 text-emerald-800 hover:text-emerald-950" />
              )}
            </button>

            <button
              onClick={() => toggleStatusFilter("offline")}
              type="button"
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold transition-all shadow-2xs cursor-pointer border ${
                statusFilters.offline
                  ? "bg-rose-100/70 text-rose-900 border-transparent font-bold shadow-2xs"
                  : "bg-slate-100 text-slate-600 border-transparent hover:bg-slate-200/70 hover:text-slate-800"
              }`}
            >
              <WifiOff
                size={14}
                className="text-rose-600"
              />
              <span>Offline ({dashboardData.offline ?? 0})</span>
              {statusFilters.offline && (
                <X size={14} className="ml-1 text-rose-800 hover:text-rose-950" />
              )}
            </button>

            <button
              onClick={() => toggleStatusFilter("missingPeripherals")}
              type="button"
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold transition-all shadow-2xs cursor-pointer border ${
                statusFilters.missingPeripherals
                  ? "bg-amber-100/70 text-amber-900 border-transparent font-bold shadow-2xs"
                  : "bg-slate-100 text-slate-600 border-transparent hover:bg-slate-200/70 hover:text-slate-800"
              }`}
            >
              <Unplug
                size={14}
                className="text-amber-600"
              />
              <span>Missing Peripherals ({missingCount})</span>
              {statusFilters.missingPeripherals && (
                <X size={14} className="ml-1 text-amber-800 hover:text-amber-950" />
              )}
            </button>
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
          refresh={refresh}
        />
      </div>
    </div>
  );
}
