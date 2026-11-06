import { useEffect, useMemo, useState } from "react";
import { Clock, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type MissingTimePerson = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobLabel?: string;
  people: MissingTimePerson[];
  defaultUserId?: string;
  submitting?: boolean;
  onConfirm: (input: { userId: string; hours: number; minutes: number; task: string }) => Promise<void>;
};

function parseWhole(raw: string, empty = 0): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return empty;
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

export default function AddMissingTimeDialog({
  open,
  onOpenChange,
  jobLabel,
  people,
  defaultUserId,
  submitting = false,
  onConfirm,
}: Props) {
  const sortedPeople = useMemo(
    () => [...people].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [people],
  );
  const [userId, setUserId] = useState("");
  const [hours, setHours] = useState("0");
  const [minutes, setMinutes] = useState("0");
  const [task, setTask] = useState("Missing time");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setUserId(defaultUserId && sortedPeople.some((p) => p.id === defaultUserId) ? defaultUserId : (sortedPeople[0]?.id ?? ""));
    setHours("0");
    setMinutes("0");
    setTask("Missing time");
    setError(null);
  }, [open, defaultUserId, sortedPeople]);

  const selected = sortedPeople.find((p) => p.id === userId);

  const submit = async () => {
    if (!userId) {
      setError("Select the person this time belongs to.");
      return;
    }
    const h = parseWhole(hours);
    const m = parseWhole(minutes);
    if (h === null) {
      setError("Hours must be a whole number.");
      return;
    }
    if (m === null) {
      setError("Minutes must be a whole number.");
      return;
    }
    if (h > 12) {
      setError("Hours cannot be more than 12 per entry.");
      return;
    }
    if (m > 59) {
      setError("Minutes must be 0–59.");
      return;
    }
    if (h * 3600 + m * 60 <= 0) {
      setError("Enter a time greater than zero.");
      return;
    }
    setError(null);
    await onConfirm({
      userId,
      hours: h,
      minutes: m,
      task: task.trim() || "Missing time",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white text-gray-900 border-gray-200 [&>button]:text-gray-500 [&>button]:hover:text-gray-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900">
            <Clock size={18} className="text-primary" />
            Add missing time
          </DialogTitle>
          <DialogDescription className="text-gray-600">
            {jobLabel
              ? `Add hours to ${jobLabel} under the person’s name. This does not start a timer.`
              : "Add hours under the person’s name. This does not start a timer."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Person</label>
            <select
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                if (error) setError(null);
              }}
              disabled={submitting || sortedPeople.length === 0}
              className="mt-1.5 w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm !text-gray-900 focus:outline-none focus:border-primary"
            >
              {sortedPeople.length === 0 ? (
                <option value="">No workers on this job</option>
              ) : (
                sortedPeople.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Hours</label>
              <input
                type="number"
                min={0}
                max={12}
                step={1}
                value={hours}
                onChange={(e) => {
                  setHours(e.target.value);
                  if (error) setError(null);
                }}
                disabled={submitting}
                className="mt-1.5 w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm !text-gray-900 focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Minutes</label>
              <input
                type="number"
                min={0}
                max={59}
                step={1}
                value={minutes}
                onChange={(e) => {
                  setMinutes(e.target.value);
                  if (error) setError(null);
                }}
                disabled={submitting}
                className="mt-1.5 w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm !text-gray-900 focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Note</label>
            <input
              value={task}
              onChange={(e) => setTask(e.target.value)}
              disabled={submitting}
              placeholder="Missing time"
              className="mt-1.5 w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm !text-gray-900 !placeholder:text-gray-400 focus:outline-none focus:border-primary"
            />
          </div>

          {selected ? (
            <p className="text-xs text-gray-500">
              Time will be saved as <span className="font-semibold text-gray-800">{selected.name}</span> on this job only.
            </p>
          ) : null}
          {error ? <p className="text-xs text-red-600 font-medium">{error}</p> : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || !userId}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
            Add time
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
