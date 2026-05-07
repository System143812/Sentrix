export function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-line bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Analytics</h2>
        <p className="mt-2 text-sm text-slate-500">
          Review device performance trends, uptime, and group usage over time.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Average CPU</p>
          <p className="mt-4 text-3xl font-bold">
            {Math.floor(Math.random() * 40) + 40}%
          </p>
        </div>
        <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Average RAM</p>
          <p className="mt-4 text-3xl font-bold">
            {Math.floor(Math.random() * 30) + 50}%
          </p>
        </div>
        <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Agent uptime</p>
          <p className="mt-4 text-3xl font-bold">
            {Math.floor(Math.random() * 12) + 88}%
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold">Health overview</h3>
        <p className="mt-2 text-sm text-slate-500">
          Live data will appear once devices report metrics through the Sentrix
          agent.
        </p>
      </div>
    </div>
  );
}
