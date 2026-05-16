import { Card } from "./Card.jsx";
import { STAT_CARD_TONES } from "../styles/tones.js";

export function StatCard({ icon: Icon, label, value = 0, tone = "default" }) {
  return (
    <Card padding="4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        <span className={`rounded-md border p-2 ${STAT_CARD_TONES[tone]}`}>
          <Icon size={18} />
        </span>
      </div>
      <strong className="mt-3 block text-3xl">{value}</strong>
    </Card>
  );
}
