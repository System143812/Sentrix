import { DeviceTable } from "../components/DeviceTable.jsx";
import { PageHeader } from "../components/PageHeader.jsx";

export function DevicesPage({
  dashboardData,
  loading,
  onUpdateGroup,
  groups,
  onArchive,
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Devices"
        subtitle="Manage device groups, expand device details, and review agent status at a glance."
      />

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
