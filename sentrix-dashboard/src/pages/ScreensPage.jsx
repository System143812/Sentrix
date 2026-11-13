import { useState, useMemo } from "react";
import {
  Monitor,
  Eye,
  CheckCircle2,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader.jsx";
import { Card } from "../components/Card.jsx";
import { SearchFilterBar } from "../components/SearchFilterBar.jsx";
import { ScreenMonitorModal } from "../components/ScreenMonitorModal.jsx";
import { matchesSearch } from "../shared/utils.js";

export function ScreensPage({ dashboardData }) {
  const [query, setQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [viewMode, setViewMode] = useState("grid"); // grid | table

  const devices = dashboardData?.clients || [
    {
      id: "1",
      hostname: "LAB-PC-01",
      ip: "192.168.1.101",
      group: "Lab A",
      status: "online",
      activeApp: "Visual Studio Code",
      fps: 12,
    },
    {
      id: "2",
      hostname: "LAB-PC-02",
      ip: "192.168.1.102",
      group: "Lab A",
      status: "online",
      activeApp: "Google Chrome",
      fps: 15,
    },
    {
      id: "3",
      hostname: "LAB-PC-03",
      ip: "192.168.1.103",
      group: "Lab A",
      status: "idle",
      activeApp: "Desktop",
      fps: 0,
    },
    {
      id: "4",
      hostname: "LAB-PC-04",
      ip: "192.168.1.104",
      group: "Lab B",
      status: "online",
      activeApp: "Microsoft Word",
      fps: 10,
    },
    {
      id: "5",
      hostname: "LAB-PC-05",
      ip: "192.168.1.105",
      group: "Lab B",
      status: "offline",
      activeApp: "Offline",
      fps: 0,
    },
    {
      id: "6",
      hostname: "LAB-PC-06",
      ip: "192.168.1.106",
      group: "Lab B",
      status: "online",
      activeApp: "VLC Media Player",
      fps: 24,
    },
  ];

  const groupOptions = useMemo(
    () => ["all", ...new Set(devices.map((device) => device.group || "Unassigned"))],
    [devices],
  );

  const filteredDevices = useMemo(
    () =>
      devices.filter((device) => {
        const groupMatch = selectedGroup === "all" || (device.group || "Unassigned") === selectedGroup;
        return groupMatch && matchesSearch(device, query, ["hostname", "ip", "group", "status", "activeApp"]);
      }),
    [devices, query, selectedGroup],
  );

  return (
    <div className="page-reveal space-y-6">
      {selectedDevice && (
        <ScreenMonitorModal
          device={selectedDevice}
          onClose={() => setSelectedDevice(null)}
        />
      )}

      {/* Header */}
      <PageHeader
        icon={Monitor}
        title="Screen Monitoring"
        subtitle="Real-time classroom oversight, live student screen streaming, and privacy-compliant monitoring."
        backgroundImage="/devices_header.jpg"
      />

      {/* Unified Search, Filter & View Controls Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex-1 min-w-0">
          <SearchFilterBar
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
            placeholder="Search by hostname or IP..."
            query={query}
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex rounded-md border border-slate-200 bg-white p-0.5 shadow-sm">
            <button
              onClick={() => setViewMode("grid")}
              className={`rounded-md px-3 py-2 text-xs font-bold transition ${
                viewMode === "grid"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Grid View
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`rounded-md px-3 py-2 text-xs font-bold transition ${
                viewMode === "table"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Table View
            </button>
          </div>
        </div>
      </div>

      {/* Main Content: Grid vs Table */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDevices.map((device) => {
            const isOnline = device.status !== "offline";
            return (
              <Card
                key={device.id}
                padding="0"
                className="group overflow-hidden border-slate-200/60 bg-white transition hover:border-slate-400 hover:shadow-md cursor-pointer"
                onClick={() => setSelectedDevice(device)}
              >
                {/* Thumbnail Header */}
                <div className="relative aspect-video bg-slate-900 flex items-center justify-center overflow-hidden border-b border-slate-100">
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-4 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="rounded bg-black/40 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
                        {device.activeApp || "Live Desktop"}
                      </span>
                      <span className="flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400 backdrop-blur">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        {device.fps || 2} FPS
                      </span>
                    </div>

                    <div className="text-center">
                      <Monitor
                        size={36}
                        className="mx-auto text-slate-600 group-hover:text-slate-400 transition"
                        strokeWidth={1.5}
                      />
                      <p className="mt-1 text-[11px] font-medium text-slate-400">
                        Live WebSocket Stream
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>{device.ip || "Unknown IP"}</span>
                      <span className="flex items-center gap-1 text-emerald-400 font-bold">
                        <CheckCircle2 size={12} /> Ready
                      </span>
                    </div>
                  </div>

                  {/* Hover Action Overlay */}
                  <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2 backdrop-blur-[2px]">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedDevice(device);
                      }}
                      className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-900 shadow transition hover:bg-slate-100 active:scale-95"
                    >
                      <Eye size={14} strokeWidth={2.5} /> Open Live View
                    </button>
                  </div>
                </div>

                {/* Card Footer Info */}
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-slate-900 flex items-center gap-2">
                        <span>{device.hostname}</span>
                        <span
                          className={`inline-block h-2 w-2 rounded-full shrink-0 ${
                            isOnline ? "bg-emerald-500" : "bg-rose-500"
                          }`}
                          title={isOnline ? "Online" : "Offline"}
                        />
                      </p>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        {device.group || "Unassigned"}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card
          padding="0"
          className="border-slate-200/60 bg-white shadow-sm overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-4">Hostname</th>
                  <th className="py-3 px-4">IP Address</th>
                  <th className="py-3 px-4">Lab Group</th>
                  <th className="py-3 px-4">Active Application</th>
                  <th className="py-3 px-4">Stream FPS</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredDevices.map((device) => {
                  const isOnline = device.status !== "offline";
                  return (
                    <tr
                      key={device.id}
                      className="hover:bg-slate-50/50 transition"
                    >
                      <td className="py-3 px-4 font-bold text-slate-900">
                        <div className="flex items-center gap-2">
                          <span>{device.hostname}</span>
                          <span
                            className={`inline-block h-2 w-2 rounded-full shrink-0 ${
                              isOnline ? "bg-emerald-500" : "bg-rose-500"
                            }`}
                            title={isOnline ? "Online" : "Offline"}
                          />
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500">
                        {device.ip}
                      </td>
                      <td className="py-3 px-4">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                          {device.group || "Unassigned"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {device.activeApp || "Desktop"}
                      </td>
                      <td className="py-3 px-4 text-emerald-600 font-bold">
                        {device.fps || 2} FPS
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setSelectedDevice(device)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-sm transition hover:bg-slate-900 hover:text-white"
                        >
                          <Eye size={12} /> Open View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
