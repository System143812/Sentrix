import { DeviceTable } from "../components/DeviceTable.jsx";
import { GroupPanel } from "../components/GroupPanel.jsx";

export function HomePage({
  dashboardData,
  loading,
  onUpdateGroup,
  groups,
  onArchive,
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-line bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Total registered</p>
          <p className="mt-3 text-3xl font-bold">{dashboardData.total}</p>
        </div>
        <div className="rounded-lg border border-line bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Online</p>
          <p className="mt-3 text-3xl font-bold text-emerald-700">
            {dashboardData.online}
          </p>
        </div>
        <div className="rounded-lg border border-line bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Offline</p>
          <p className="mt-3 text-3xl font-bold text-red-700">
            {dashboardData.offline}
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div>
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
