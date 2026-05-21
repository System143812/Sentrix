import { DeviceTable } from "../components/DeviceTable.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Laptop } from "lucide-react";

export function DevicesPage({
  dashboardData,
  loading,
  onUpdateGroup,
  groups,
  onArchive,
}) {
  return (
    <div className="space-y-6 animate-in fade-in duration-500 font-data">
      <PageHeader
        icon={Laptop}
        title="Fleet Management"
        subtitle="Manage logical groupings and technical specifications for the terminal fleet."
        backgroundImage="/love_computer.gif"
      />

      <div className="min-w-0 w-full">
        <DeviceTable
          devices={dashboardData.clients || []}
          loading={loading}
          onUpdateGroup={onUpdateGroup}
          groups={groups}
          onArchive={onArchive}
        />
      </div>
    </div>
  );
}

