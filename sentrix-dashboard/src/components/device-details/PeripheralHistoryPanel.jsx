import { Usb } from "lucide-react";
import { useState, useEffect } from "react";
import { DateFilterBar } from "../DateFilterBar.jsx";
import { useTelemetryInterval } from "../../hooks/useTelemetryInterval.js";
import * as clientApi from "../../services/clientApi.js";

function dateToMs(value, endOfDay = false) {
  if (!value) return "";
  const date = new Date(
    `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`,
  );
  return Number.isNaN(date.getTime()) ? "" : String(date.getTime());
}

export function PeripheralHistoryPanel({ deviceId, history, canControl }) {
  const [localHistory, setLocalHistory] = useState(
    history || { inventory: [], events: [] },
  );
  const [statusView, setStatusView] = useState("active");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [pendingKey, setPendingKey] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const refreshIntervalMs = useTelemetryInterval();

  const inventory = localHistory?.inventory || [];
  const events = localHistory?.events || [];
  const activeInventory = inventory.filter(
    (item) => item.status !== "archived",
  );
  const archivedInventory = inventory.filter(
    (item) => item.status === "archived",
  );
  const visibleInventory =
    statusView === "archived" ? archivedInventory : activeInventory;
  const missing = activeInventory.filter((item) => item.status === "missing");

  async function reloadHistory(showLoading = false) {
    if (!deviceId) return;
    if (showLoading) setLoading(true);
    try {
      const nextHistory = await clientApi.getClientPeripheralHistoryFiltered(
        deviceId,
        {
          startDate: dateToMs(startDate),
          endDate: dateToMs(endDate, true),
        },
      );
      setLocalHistory(nextHistory || { inventory: [], events: [] });
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function poll() {
      if (!active) return;
      if (!startDate && !endDate) {
        await reloadHistory(false);
      }
    }

    const timer = setInterval(poll, refreshIntervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [deviceId, refreshIntervalMs, startDate, endDate]);

  async function handlePeripheralAction(item, action) {
    setPendingKey(`${action}:${item.key}`);
    setMessage("");
    try {
      await clientApi.updatePeripheralStatus(deviceId, item.key, action);
      await reloadHistory();
      setMessage(
        `${item.name || "Peripheral"} ${action === "resolve" ? "resolved" : action === "archive" ? "archived" : "recovered"}.`,
      );
    } catch (error) {
      setMessage(error.message || "Unable to update peripheral.");
    } finally {
      setPendingKey("");
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-slate-200/60 bg-white p-5 sm:p-6 shadow-sm">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-100 bg-amber-50 text-amber-600 shadow-sm">
            <Usb size={18} strokeWidth={2.5} />
          </span>
          <h4 className="text-sm font-bold uppercase tracking-widest text-slate-800 font-ui">
            Peripheral Tracking
          </h4>
        </div>
        {missing.length ? (
          <span className="w-fit rounded-full border border-rose-200 bg-rose-50 px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-rose-600 shadow-sm">
            {missing.length} Missing Hardware
          </span>
        ) : (
          <span className="w-fit rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-600 shadow-sm">
            Security Check: Clear
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2 min-w-0 items-stretch">
        <div className="flex flex-col min-w-0">
          <div className="relative mb-4 flex items-center p-1 rounded-lg border border-slate-200 overflow-hidden w-fit shadow-sm">
            {/* Animated Active Pill Indicator */}
            <div
              className="absolute h-[calc(100%-8px)] rounded-md bg-slate-900 transition-all duration-300 ease-in-out shadow-sm"
              style={{
                left: statusView === "active" ? "8px" : "calc(50% + 4px)",
                width: "calc(50% - 12px)",
              }}
            />

            {[
              { id: "active", label: "Active", count: activeInventory.length },
              {
                id: "archived",
                label: "Archived",
                count: archivedInventory.length,
              },
            ].map((item) => (
              <button
                className={`relative z-10 flex h-9 min-w-[120px] items-center justify-center gap-1.5 px-5 text-xs font-bold uppercase tracking-widest transition-all duration-200 ${
                  statusView === item.id
                    ? "text-white"
                    : "text-slate-500 hover:text-slate-800"
                }`}
                key={item.id}
                onClick={() => setStatusView(item.id)}
                type="button"
              >
                {item.label}
                <span
                  className={`tabular-nums transition-opacity ${statusView === item.id ? "text-white opacity-100" : "opacity-60"}`}
                >
                  ({item.count})
                </span>
              </button>
            ))}
          </div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 font-ui px-1">
            Inventory State
          </p>
          <div className="custom-scrollbar overflow-auto pr-1 max-h-[500px] flex-1">
            {visibleInventory.length ? (
              <div className="grid gap-3">
                {visibleInventory.map((item) => (
                  <div
                    className="rounded-lg border border-slate-100 bg-slate-50/50 p-4 shadow-sm transition hover:bg-white hover:border-slate-200 min-w-0"
                    key={item.key}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="break-all text-sm font-bold text-slate-800 font-ui">
                          {item.name}
                        </p>
                        <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          {item.category || "Peripheral"}
                          {item.vendor ? ` - ${item.vendor}` : ""}
                        </p>
                      </div>
                      <span
                        className={`w-fit whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight border ${
                          item.status === "missing"
                            ? "bg-rose-50 border-rose-100 text-rose-600"
                            : item.status === "resolved"
                              ? "bg-blue-50 border-blue-100 text-blue-600"
                              : item.status === "archived"
                                ? "bg-slate-100 border-slate-200 text-slate-500"
                                : "bg-emerald-50 border-emerald-100 text-emerald-600"
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-3 text-[10px] font-bold text-slate-400 font-data">
                      Reported{" "}
                      {item.lastSeenAt
                        ? new Date(Number(item.lastSeenAt)).toLocaleString()
                        : "Unknown"}
                    </p>
                    {canControl ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {item.status === "missing" ? (
                          <button
                            className="h-9 rounded-lg border border-blue-100 bg-blue-50 px-3 text-[10px] font-bold uppercase tracking-wide text-blue-700 disabled:opacity-60"
                            disabled={pendingKey === `resolve:${item.key}`}
                            onClick={() =>
                              handlePeripheralAction(item, "resolve")
                            }
                            type="button"
                          >
                            Resolve
                          </button>
                        ) : null}
                        {item.status !== "archived" ? (
                          <button
                            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-bold uppercase tracking-wide text-slate-600 disabled:opacity-60"
                            disabled={pendingKey === `archive:${item.key}`}
                            onClick={() =>
                              handlePeripheralAction(item, "archive")
                            }
                            type="button"
                          >
                            Archive
                          </button>
                        ) : (
                          <button
                            className="h-9 rounded-lg border border-emerald-100 bg-emerald-50 px-3 text-[10px] font-bold uppercase tracking-wide text-emerald-700 disabled:opacity-60"
                            disabled={pendingKey === `recover:${item.key}`}
                            onClick={() =>
                              handlePeripheralAction(item, "recover")
                            }
                            type="button"
                          >
                            Recover
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center h-full flex items-center justify-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-300 font-ui">
                  No Inventory Samples
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col min-w-0">
          <DateFilterBar
            endDate={endDate}
            loading={pendingKey !== ""}
            onApply={reloadHistory}
            onEndDateChange={setEndDate}
            onStartDateChange={setStartDate}
            startDate={startDate}
            className="mb-4"
          />
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 font-ui px-1">
            Audit Log
          </p>
          <div className="custom-scrollbar overflow-auto pr-1 max-h-[500px] flex-1">
            {events.length ? (
              <div className="grid gap-3">
                {events.map((event) => (
                  <div
                    className="rounded-lg border border-slate-100 bg-slate-50/50 p-4 shadow-sm transition hover:bg-white hover:border-slate-200 min-w-0"
                    key={event.id}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="break-all text-sm font-bold text-slate-800 font-ui">
                        {event.name}
                      </p>
                      <span
                        className={`w-fit whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight border ${
                          event.eventType === "connected"
                            ? "bg-emerald-50 border-emerald-100 text-emerald-600"
                            : "bg-amber-50 border-amber-100 text-amber-700"
                        }`}
                      >
                        {event.eventType === "missing_after_offline"
                          ? "Missing after offline"
                          : event.eventType}
                      </span>
                    </div>
                    <p className="mt-3 text-[10px] font-bold text-slate-400 font-data">
                      {event.observedAt
                        ? new Date(Number(event.observedAt)).toLocaleString()
                        : "No time recorded"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center h-full flex items-center justify-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-300 font-ui">
                  Logs Empty
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
