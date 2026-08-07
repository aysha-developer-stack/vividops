import { useEffect } from "react";
import { CheckCircle2, ChevronDown, FileText, X } from "lucide-react";
import type { UploadProgressBatch } from "@/hooks/useUploadProgress";
import { formatUploadFileSize } from "@/lib/uploadWithProgress";

const AUTO_DISMISS_MS = 2500;

type Props = {
  batch: UploadProgressBatch;
  onDismiss: () => void;
  onToggleCollapsed: () => void;
};

function batchTitle(batch: UploadProgressBatch): string {
  const total = batch.items.length;
  const completed = batch.items.filter((item) => item.status === "completed").length;
  const uploading = batch.items.some((item) => item.status === "uploading" || item.status === "pending");
  const failed = batch.items.some((item) => item.status === "error");

  if (uploading) {
    return total === 1 ? "Uploading 1 item" : `Uploading ${total} items`;
  }
  if (failed && completed === 0) {
    return total === 1 ? "Upload failed" : `${total} uploads failed`;
  }
  if (failed) {
    return `${completed} of ${total} uploaded`;
  }
  if (total === 1) return "File uploaded";
  return `${total} items uploaded`;
}

function aggregateProgress(batch: UploadProgressBatch): number {
  if (batch.items.length === 0) return 0;
  const total = batch.items.reduce((sum, item) => sum + item.progress, 0);
  return Math.round(total / batch.items.length);
}

export default function UploadProgressPanel({ batch, onDismiss, onToggleCollapsed }: Props) {
  const progress = aggregateProgress(batch);
  const allDone = batch.items.every((item) => item.status === "completed" || item.status === "error");
  const allSuccess =
    batch.items.length > 0 && batch.items.every((item) => item.status === "completed");
  const barColor = batch.items.some((item) => item.status === "error")
    ? "bg-red-500"
    : allDone
      ? "bg-emerald-500"
      : "bg-primary";

  useEffect(() => {
    if (!allSuccess) return;
    const timer = window.setTimeout(() => onDismiss(), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [allSuccess, batch.id, onDismiss]);

  return (
    <div className="fixed bottom-6 right-6 z-[100] w-[min(100vw-2rem,360px)] overflow-hidden rounded-xl border border-gray-200/80 bg-white/95 shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm font-semibold text-gray-800">{batchTitle(batch)}</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label={batch.collapsed ? "Expand upload details" : "Collapse upload details"}
          >
            <ChevronDown
              size={16}
              className={`transition-transform ${batch.collapsed ? "-rotate-90" : "rotate-0"}`}
            />
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close upload panel"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {!batch.collapsed && (
        <div className="max-h-56 overflow-y-auto border-t border-gray-100">
          {batch.items.map((item) => (
            <div key={item.id} className="relative border-b border-gray-50 last:border-b-0">
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                  <FileText size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-gray-800">
                    {item.fileName}
                    <span className="text-gray-400"> — {formatUploadFileSize(item.fileSize)}</span>
                  </p>
                  {item.status === "error" && (
                    <p className="mt-0.5 truncate text-xs text-red-600">{item.error ?? "Upload failed"}</p>
                  )}
                  {item.status === "uploading" && (
                    <p className="mt-0.5 text-xs text-gray-500">{item.progress}%</p>
                  )}
                  {item.status === "completed" && (
                    <p className="mt-0.5 text-xs font-medium text-emerald-600">File uploaded</p>
                  )}
                </div>
                {item.status === "completed" && (
                  <CheckCircle2 size={18} className="shrink-0 text-emerald-500" aria-hidden />
                )}
              </div>
              <div className="h-0.5 bg-gray-100">
                <div
                  className={`h-full transition-all duration-300 ${item.status === "error" ? "bg-red-500" : item.status === "completed" ? "bg-emerald-500" : "bg-primary"}`}
                  style={{ width: `${item.status === "completed" ? 100 : item.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="h-1 bg-gray-100">
        <div
          className={`h-full transition-all duration-300 ${barColor}`}
          style={{ width: `${allDone ? 100 : progress}%` }}
        />
      </div>
    </div>
  );
}
