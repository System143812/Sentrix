import { Layers } from "lucide-react";

export function GroupPanel({ devices = [] }) {
  const groups = devices.reduce((result, device) => {
    const group = device.group || "Unassigned";
    result[group] = result[group] || [];
    result[group].push(device);
    return result;
  }, {});

  return (
    <aside className="rounded-lg border border-line bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold">Groups</h2>
        <span className="rounded-md border border-teal-100 bg-teal-50 p-2 text-ocean">
          <Layers size={17} />
        </span>
      </div>

      <div className="grid gap-3">
        {Object.entries(groups).length === 0 ? (
          <p className="text-sm text-slate-500">No groups yet.</p>
        ) : (
          Object.entries(groups).map(([group, groupDevices]) => (
            <section className="rounded-md border border-line p-3" key={group}>
              <div className="flex items-center justify-between gap-3">
                <strong className="text-sm">{group}</strong>
                <span className="rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
                  {groupDevices.length}
                </span>
              </div>
              <div className="mt-2 grid gap-1">
                {groupDevices.slice(0, 5).map((device) => (
                  <span
                    className="truncate text-xs text-slate-500"
                    key={device.id}
                  >
                    {device.hostname}
                  </span>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </aside>
  );
}
