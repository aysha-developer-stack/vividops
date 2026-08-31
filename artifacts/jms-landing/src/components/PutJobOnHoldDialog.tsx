import { useEffect, useState } from "react";
import { Pause, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobLabel?: string;
  submitting?: boolean;
  onConfirm: (reason: string) => void | Promise<void>;
};

export default function PutJobOnHoldDialog({
  open,
  onOpenChange,
  jobLabel,
  submitting = false,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setReason("");
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("Please enter a reason for putting this job on hold.");
      return;
    }
    setError(null);
    await onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white text-gray-900 border-gray-200 [&>button]:text-gray-500 [&>button]:hover:text-gray-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900">
            <Pause size={18} className="text-orange-600" />
            Put job on hold
          </DialogTitle>
          <DialogDescription className="text-gray-600">
            {jobLabel
              ? `Pause work on ${jobLabel}. Workers cannot submit or update the checklist until the job is resumed.`
              : "Pause work on this job. Workers cannot submit or update the checklist until the job is resumed."}
          </DialogDescription>
        </DialogHeader>
        <div>
          <label htmlFor="hold-reason" className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
            Reason for hold <span className="text-red-500">*</span>
          </label>
          <textarea
            id="hold-reason"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError(null);
            }}
            rows={4}
            placeholder="e.g. Waiting for client documents, site access delayed, scope clarification needed…"
            className="mt-2 w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm !text-gray-900 !placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-300 resize-y min-h-[96px]"
            disabled={submitting}
          />
          {error ? <p className="mt-1.5 text-xs text-red-600 font-medium">{error}</p> : null}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Pause size={14} />
                Put on Hold
              </>
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
