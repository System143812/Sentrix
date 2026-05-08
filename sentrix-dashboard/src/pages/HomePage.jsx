import { DeviceTable } from "../components/DeviceTable.jsx";
import { GroupPanel } from "../components/GroupPanel.jsx";

export function HomePage({
  user,
  dashboardData,
  loading,
  onUpdateGroup,
  groups,
  onArchive,
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-line bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-ocean">
          Computer Lab Monitoring
        </p>
        <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-normal sm:text-3xl">
              Device lifecycle management for school labs
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Signed in as {user?.email}. Monitor, discover, organize, and
              prepare agent deployment from one console.
            </p>
          </div>
        </div>
      </section>

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

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
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
