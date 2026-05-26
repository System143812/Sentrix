import { MonitorCog } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { DeviceTable } from "../components/DeviceTable.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { SearchFilterBar } from "../components/SearchFilterBar.jsx";
import { matchesSearch } from "../shared/utils.js";
import { usePaginationState } from "../hooks/usePaginationState.js";

export function DevicesPage({
  dashboardData,
  loading,
  onUpdateGroup,
  groups,
  onArchive,
  canControl = false,
  canManagePeripherals = false,
}) {
  const [query, setQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("all");
  const { currentPage, pageSize, setCurrentPage, setPageSize } = usePaginationState("devices", 5);

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

  const paginatedDevices = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredDevices.slice(start, start + pageSize);
  }, [filteredDevices, currentPage, pageSize]);

  // Reset to page 1 when query or group changes
  useEffect(() => {
    setCurrentPage(1);
  }, [query, selectedGroup]);

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
        devices={paginatedDevices}
        loading={loading}
        onUpdateGroup={onUpdateGroup}
        groups={groups}
        onArchive={onArchive}
        canControl={canControl}
        canManagePeripherals={canManagePeripherals}
        currentPage={currentPage}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        totalItems={filteredDevices.length}
      />
    </div>
  );
}
