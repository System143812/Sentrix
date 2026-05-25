import { MonitorCog } from "lucide-react";
import { useMemo, useState } from "react";
import { DeviceTable } from "../components/DeviceTable.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { SearchFilterBar, matchesSearch } from "../components/SearchFilterBar.jsx";

export function DevicesPage({
  dashboardData,
  loading,
  onUpdateGroup,
  groups,
  onArchive,
  canControl = false,
}) {
  const [query, setQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("all");
  const devices = dashboardData.clients || [];
  const groupOptions = useMemo(
    () => ["all", ...new Set(devices.map((device) => device.group || "Unassigned"))],
    [devices],
  );
  const filteredDevices = useMemo(
    () =>
      devices.filter((device) => {
        const groupMatch = selectedGroup === "all" || (device.group || "Unassigned") === selectedGroup;
        return groupMatch && matchesSearch(device, query, ["hostname", "os", "ip", "mac", "group", "status"]);
      }),
    [devices, query, selectedGroup],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={MonitorCog}
        title="Devices"
        subtitle="Manage device groups, expand device details, and review agent status at a glance."
        backgroundImage="/love_computer.jpg"
      />

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
        placeholder="Search devices by name, IP, MAC, group, or status"
        query={query}
      />

      <DeviceTable
        devices={filteredDevices}
        loading={loading}
        onUpdateGroup={onUpdateGroup}
        groups={groups}
        onArchive={onArchive}
        canControl={canControl}
      />
    </div>
  );
}
