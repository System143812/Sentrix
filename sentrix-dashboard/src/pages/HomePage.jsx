import { DeviceTable } from "../components/DeviceTable.jsx";
import { GroupPanel } from "../components/GroupPanel.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Card } from "../components/Card.jsx";

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
      <PageHeader
        title="Device lifecycle management for school labs"
        subtitle={`Signed in as ${user?.email}. Monitor, discover, organize, and prepare agent deployment from one console.`}
      />

      <div className="grid gap-3 md:grid-cols-3">
        <Card padding="4">
          <p className="text-sm text-slate-500">Total registered</p>
          <p className="mt-3 text-3xl font-bold">{dashboardData.total}</p>
        </Card>
        <Card padding="4">
          <p className="text-sm text-slate-500">Online</p>
          <p className="mt-3 text-3xl font-bold text-emerald-700">
            {dashboardData.online}
          </p>
        </Card>
        <Card padding="4">
          <p className="text-sm text-slate-500">Offline</p>
          <p className="mt-3 text-3xl font-bold text-red-700">
            {dashboardData.offline}
          </p>
        </Card>
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
