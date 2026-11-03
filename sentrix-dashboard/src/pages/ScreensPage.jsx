import { useState } from "react";
import {
  Monitor,
  Search,
  Maximize2,
  Camera,
  Eye,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader.jsx";
import { Card } from "../components/Card.jsx";
import { StatusBadge } from "../components/StatusBadge.jsx";

export function ScreensPage({ dashboardData }) {
  const [query, setQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [viewMode, setViewMode] = useState("grid"); // grid | table
  const [isFullScreen, setIsFullScreen] = useState(false);

  const devices = dashboardData?.clients || [
    { id: "1", hostname: "LAB-PC-01", ip: "192.168.8.101", group: "Lab A", status: "online", activeApp: "Visual Studio Code", fps: 12 },
    { id: "2", hostname: "LAB-PC-02", ip: "192.168.8.102", group: "Lab A", status: "online", activeApp: "Google Chrome", fps: 15 },
    { id: "3", hostname: "LAB-PC-03", ip: "192.168.8.103", group: "Lab A", status: "idle", activeApp: "Desktop", fps: 0 },
    { id: "4", hostname: "LAB-PC-04", ip: "192.168.8.104", group: "Lab B", status: "online", activeApp: "Microsoft Word", fps: 10 },
    { id: "5", hostname: "LAB-PC-05", ip: "192.168.8.105", group: "Lab B", status: "offline", activeApp: "Offline", fps: 0 },
    { id: "6", hostname: "LAB-PC-06", ip: "192.168.8.106", group: "Lab B", status: "online", activeApp: "VLC Media Player", fps: 24 },
  ];

  const filteredDevices = devices.filter((device) => {
    const matchesQuery =
      device.hostname?.toLowerCase().includes(query.toLowerCase()) ||
      device.ip?.toLowerCase().includes(query.toLowerCase());
    const matchesGroup = selectedGroup === "all" || device.group === selectedGroup;
    return matchesQuery && matchesGroup;
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <PageHeader
        icon={Monitor}
        title="Screen Monitoring"
        subtitle="Real-time classroom oversight, live student screen streaming, and privacy-compliant monitoring."
        backgroundImage="/devices_header.jpg"
      />

      {/* Filter and View Controls */}
      <Card padding="p-4" className="border-slate-200/60 bg-white shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by hostname or IP..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:bg-white focus:outline-none"
              />
            </div>

            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium text-slate-700 focus:border-slate-900 focus:bg-white focus:outline-none"
            >
              <option value="all">All Groups / Labs</option>
              <option value="Lab A">Lab A</option>
              <option value="Lab B">Lab B</option>
              <option value="Unassigned">Unassigned</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
              <button
                onClick={() => setViewMode("grid")}
                className={`rounded-md px-3 py-1 text-xs font-bold transition ${
                  viewMode === "grid" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Grid View
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`rounded-md px-3 py-1 text-xs font-bold transition ${
                  viewMode === "table" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Table View
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Main Content: Grid vs Table */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDevices.map((device) => (
            <Card
              key={device.id}
              padding="0"
              className="group overflow-hidden border-slate-200/60 bg-white transition hover:border-slate-400 hover:shadow-md cursor-pointer"
              onClick={() => setSelectedDevice(device)}
            >
              {/* Thumbnail Header */}
              <div className="relative aspect-video bg-slate-900 flex items-center justify-center overflow-hidden border-b border-slate-100">
                {/* Simulated Screen Feed */}
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-black/40 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
                      {device.activeApp}
                    </span>
                    <span className="flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400 backdrop-blur">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {device.fps} FPS
                    </span>
                  </div>

                  <div className="text-center">
                    <Monitor size={36} className="mx-auto text-slate-600 group-hover:text-slate-400 transition" strokeWidth={1.5} />
                    <p className="mt-1 text-[11px] font-medium text-slate-400">Live WebRTC Stream</p>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>{device.ip}</span>
                    <span className="flex items-center gap-1 text-emerald-400 font-bold">
                      <CheckCircle2 size={12} /> Consent Active
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
                    <Eye size={14} strokeWidth={2.5} /> Focus Stream
                  </button>
                </div>
              </div>

              {/* Card Footer Info */}
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-slate-900">{device.hostname}</p>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      {device.group || "Unassigned"}
                    </span>
                  </div>
                  <StatusBadge status={device.status} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card padding="0" className="border-slate-200/60 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-4">Hostname</th>
                  <th className="py-3 px-4">IP Address</th>
                  <th className="py-3 px-4">Lab Group</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Active Application</th>
                  <th className="py-3 px-4">Stream FPS</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredDevices.map((device) => (
                  <tr key={device.id} className="hover:bg-slate-50/50 transition">
                    <td className="py-3 px-4 font-bold text-slate-900">{device.hostname}</td>
                    <td className="py-3 px-4 font-mono text-slate-500">{device.ip}</td>
                    <td className="py-3 px-4">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        {device.group || "Unassigned"}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={device.status} />
                    </td>
                    <td className="py-3 px-4 text-slate-600">{device.activeApp}</td>
                    <td className="py-3 px-4 text-emerald-600 font-bold">{device.fps} FPS</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setSelectedDevice(device)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-sm transition hover:bg-slate-900 hover:text-white"
                      >
                        <Eye size={12} /> Focus
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Focused Stream Modal / Drawer */}
      {selectedDevice && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600">
                  <Monitor size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{selectedDevice.hostname} — Focused Stream</h3>
                  <p className="text-[11px] font-medium text-slate-500">{selectedDevice.ip} • Lab: {selectedDevice.group}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsFullScreen(!isFullScreen)}
                  className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 shadow-sm hover:bg-slate-50 transition"
                  title="Toggle Fullscreen"
                >
                  <Maximize2 size={16} />
                </button>
                <button
                  onClick={() => setSelectedDevice(null)}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white shadow transition hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Modal Body / Stream Player */}
            <div className="p-6 bg-slate-950 flex flex-col items-center justify-center aspect-video relative">
              <div className="absolute top-4 left-4 flex items-center gap-2">
                <span className="flex items-center gap-1.5 rounded bg-emerald-500/20 px-2.5 py-1 text-xs font-bold text-emerald-400 backdrop-blur border border-emerald-500/30">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  WebRTC Live • 1280x720 @ 15fps
                </span>
                <span className="rounded bg-black/60 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
                  Active App: {selectedDevice.activeApp}
                </span>
              </div>

              <div className="text-center">
                <Monitor size={64} className="mx-auto text-slate-700 animate-pulse" strokeWidth={1} />
                <p className="mt-3 text-sm font-bold text-slate-400">Receiving Secure WebRTC Feed...</p>
                <p className="mt-1 text-xs text-slate-600">Client Privacy Consent Verified • DTLS 1.3 Encrypted</p>
              </div>

              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between bg-black/70 backdrop-blur rounded-xl p-3 border border-slate-800">
                <div className="flex items-center gap-3">
                  <button className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-emerald-500 transition">
                    <Camera size={14} /> Snapshot
                  </button>
                  <button className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-300 shadow hover:bg-slate-700 transition">
                    <Lock size={14} /> Lock Input
                  </button>
                </div>
                <span className="text-xs font-mono text-slate-400">Latency: 14ms</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
