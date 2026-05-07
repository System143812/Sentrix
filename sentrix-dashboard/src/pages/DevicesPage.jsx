import { DeviceTable } from "../components/DeviceTable.jsx";

export function DevicesPage({
  dashboardData,
  loading,
  onUpdateGroup,
  groups,
  onArchive,
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-line bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Devices</h2>
        <p className="mt-2 text-sm text-slate-500">
          Manage device groups, expand device details, and review agent status
          at a glance.
        </p>
      </div>

      <DeviceTable
        devices={dashboardData.clients || []}
        loading={loading}
        onUpdateGroup={onUpdateGroup}
        groups={groups}
        onArchive={onArchive}
      />
    </div>
  );
}
