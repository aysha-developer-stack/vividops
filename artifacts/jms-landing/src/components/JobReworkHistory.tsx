import { History } from "lucide-react";
import { formatMistakeCategory } from "@/lib/mistakeCategories";
import {
  originSequenceByReworkId,
  reworkHistoryStatusLabel,
  reworkSequenceLabel,
} from "@/lib/reworkOriginSequence";

export type ReworkHistoryRecord = {
  id: string;
  cycleNumber: number;
  reworkOrigin?: string | null;
  reason: string;
  comments: string | null;
  status: string;
  category: string;
  severity: string;
  checklistItemId: number | null;
  assignedAt: string;
  completedAt?: string | null;
  approvedAt?: string | null;
  createdBy?: { id: string; name: string } | null;
  user?: { id: string; name: string } | null;
};

function statusClass(status: string): string {
  if (status === "cancelled") return "bg-rose-50 text-rose-700 border-rose-100";
  if (status === "approved") return "bg-emerald-50 text-emerald-700 border-emerald-100";
  if (status === "awaiting_review") return "bg-sky-50 text-sky-700 border-sky-100";
  return "bg-amber-50 text-amber-800 border-amber-100";
}

export function ReworkCycleCard({
  rework,
  sequence,
  compact = false,
}: {
  rework: ReworkHistoryRecord;
  sequence: number;
  compact?: boolean;
}) {
  const label = reworkSequenceLabel(rework.reworkOrigin, sequence);
  return (
    <div className={`rounded-xl border bg-white ${compact ? "border-gray-100 p-3" : "border-gray-200 p-4"}`}>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-xs font-bold text-gray-900">
          {label}
          {rework.checklistItemId ? ` · Item ${rework.checklistItemId}` : ""}
        </span>
        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${statusClass(rework.status)}`}>
          {reworkHistoryStatusLabel(rework.status)}
        </span>
      </div>
      <p className="text-sm text-gray-800 whitespace-pre-wrap">{rework.reason}</p>
      {rework.comments ? (
        <p className="text-[13px] text-gray-600 mt-1.5 whitespace-pre-wrap">
          <span className="font-semibold text-gray-700">Instructions: </span>
          {rework.comments}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2 mt-2 text-[10px] font-bold uppercase">
        <span className="text-purple-700 bg-purple-50 rounded-full px-2 py-0.5">{formatMistakeCategory(rework.category)}</span>
        <span className="text-red-700 bg-red-50 rounded-full px-2 py-0.5">{rework.severity}</span>
      </div>
      <div className="mt-2 text-[11px] text-gray-500">
        {rework.createdBy?.name ? `Logged by ${rework.createdBy.name}` : null}
        {rework.user?.name ? ` · Assigned to ${rework.user.name}` : null}
        {` · ${new Date(rework.assignedAt).toLocaleString()}`}
        {rework.completedAt ? ` · Finished ${new Date(rework.completedAt).toLocaleString()}` : ""}
        {rework.approvedAt ? ` · Closed ${new Date(rework.approvedAt).toLocaleString()}` : ""}
      </div>
    </div>
  );
}

export default function JobReworkHistory({ reworks }: { reworks: ReworkHistoryRecord[] }) {
  const sequenceById = originSequenceByReworkId(reworks.map(({ status: _status, ...row }) => row));
  const ordered = [...reworks].sort((a, b) => {
    const at = Date.parse(a.assignedAt) || 0;
    const bt = Date.parse(b.assignedAt) || 0;
    return bt - at;
  });

  if (ordered.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="flex items-center gap-2 text-gray-900 font-bold">
            <History size={16} className="text-gray-500" /> Rework history
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Every rework cycle on this job stays here, including comments and instructions from earlier cycles.
          </p>
        </div>
        <span className="text-xs font-bold text-gray-600 bg-gray-50 border border-gray-200 rounded-full px-3 py-1">
          {ordered.length} {ordered.length === 1 ? "cycle" : "cycles"}
        </span>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {ordered.map((rw) => (
          <ReworkCycleCard
            key={rw.id}
            rework={rw}
            sequence={sequenceById.get(rw.id) ?? rw.cycleNumber}
          />
        ))}
      </div>
    </div>
  );
}
