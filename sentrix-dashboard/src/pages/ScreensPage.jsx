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
import { DeviceGridCard } from "../components/DeviceGridCard.jsx";
import { matchesSearch } from "../shared/utils.js";

export function ScreensPage({ dashboardData }) {
  const [query, setQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [viewMode, setViewMode] = useState("grid"); // grid | table
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 6;

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

  const totalPages = Math.ceil(filteredDevices.length / pageSize) || 1;
  const paginatedDevices = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredDevices.slice(start, start + pageSize);
  }, [filteredDevices, currentPage]);

  const handleGroupChange = (group) => {
    setSelectedGroup(group);
    setCurrentPage(1);
  };

  const handleQueryChange = (q) => {
    setQuery(q);
    setCurrentPage(1);
  };

  return (
    <div className="page-reveal space-y-6">
      {selectedDevice && (
        <ScreenMonitorModal
          device={selectedDevice}
          devices={filteredDevices}
          onSelectDevice={setSelectedDevice}
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
                onChange: handleGroupChange,
                options: groupOptions.map((group) => ({
                  value: group,
                  label: group === "all" ? "All groups" : group,
                })),
              },
            ]}
            onQueryChange={handleQueryChange}
            placeholder="Search by hostname or IP..."
            query={query}
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="relative flex rounded-md border border-slate-200 bg-white p-0.5 shadow-sm overflow-hidden">
            {/* Animated Active Pill Indicator */}
            <div
              className="absolute top-0.5 bottom-0.5 rounded-md bg-slate-900 transition-all duration-300 ease-in-out shadow-sm"
              style={{
                left: `calc(2px + ${viewMode === "grid" ? 0 : 1} * (100% - 4px) / 2)`,
                width: `calc((100% - 4px) / 2)`,
              }}
            />
            <button
              onClick={() => setViewMode("grid")}
              className={`relative z-10 rounded-md px-4 py-2 text-xs font-bold transition-colors ${
                viewMode === "grid"
                  ? "text-white"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Grid View
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`relative z-10 rounded-md px-4 py-2 text-xs font-bold transition-colors ${
                viewMode === "table"
                  ? "text-white"
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
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {paginatedDevices.map((device) => (
              <DeviceGridCard
                key={device.id}
                device={device}
                onOpenModal={setSelectedDevice}
              />
            ))}
          </div>

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3 rounded-lg shadow-sm">
              <div className="text-xs text-slate-500">
                Showing <span className="font-bold text-slate-700">{(currentPage - 1) * pageSize + 1}</span> to{" "}
                <span className="font-bold text-slate-700">
                  {Math.min(currentPage * pageSize, filteredDevices.length)}
                </span>{" "}
                of <span className="font-bold text-slate-700">{filteredDevices.length}</span> devices
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  className={`rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold transition ${
                    currentPage === 1
                      ? "bg-slate-50 text-slate-400 cursor-not-allowed"
                      : "bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  Previous
                </button>
                <span className="text-xs font-bold text-slate-700 px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className={`rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold transition ${
                    currentPage === totalPages
                      ? "bg-slate-50 text-slate-400 cursor-not-allowed"
                      : "bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  Next
                </button>
              </div>
            </div>
          )}
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
