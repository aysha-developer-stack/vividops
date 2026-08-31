import { Trash2, Upload } from "lucide-react";
import type { ChecklistTemplateItem } from "@/lib/jobMeta";
import type { ChecklistInstructionOnServer } from "@/lib/checklistInstructionFiles";
import { isChecklistDocFile } from "@/lib/collectDroppedFiles";
import { CHECKLIST_FILE_ACCEPT } from "@/lib/uploadFileTypes";
import { appendChecklistFileToMap } from "@/lib/checklistTemplateUpload";

type Props = {
  items: ChecklistTemplateItem[];
  instructionsOnServer: Record<number, ChecklistInstructionOnServer>;
  pendingFiles: Record<number, File[]>;
  onRemove: (index: number) => void;
  onQueueFile: (index: number, file: File) => void;
};

export function ChecklistTemplateList({
  items,
  instructionsOnServer,
  pendingFiles,
  onRemove,
  onQueueFile,
}: Props) {
  if (items.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-xs text-gray-400">No checklist tasks yet</div>
    );
  }

  return (
    <div className="divide-y divide-gray-50 max-h-[280px] overflow-y-auto">
      {items.map((it, idx) => {
        const itemId = idx + 1;
        const onServer = instructionsOnServer[itemId];
        const queued = pendingFiles[idx] ?? [];
        const inputId = `checklist-instruction-upload-${idx}`;
        return (
          <div key={`${idx}-${it.text}`} className="px-4 py-3 flex items-start gap-3">
            <div className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold shrink-0">
              {itemId}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-900 break-words whitespace-normal leading-snug">
                {it.text}
              </div>
              {it.desc && <div className="text-[11px] text-gray-500 mt-0.5">{it.desc}</div>}
              {onServer ? (
                <div className="mt-1.5 text-[11px] text-emerald-700 font-medium break-words whitespace-normal leading-snug">
                  Instruction file on server: {onServer.fileName}
                </div>
              ) : queued.length > 0 ? (
                <div className="mt-1.5 space-y-0.5">
                  {queued.map((f) => (
                    <div key={f.name} className="text-[11px] text-primary font-medium break-words whitespace-normal leading-snug">
                      Queued for upload: {f.name}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-1.5 text-[11px] text-amber-700 font-medium">
                  Missing instruction file — upload Word/PDF below
                </div>
              )}
              {!onServer && (
                <div className="mt-2">
                  <input
                    id={inputId}
                    type="file"
                    accept={CHECKLIST_FILE_ACCEPT}
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      if (!isChecklistDocFile(file)) {
                        window.alert("Checklist files must be Word (.doc, .docx) or PDF only.");
                        return;
                      }
                      onQueueFile(idx, file);
                    }}
                  />
                  <label
                    htmlFor={inputId}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 cursor-pointer"
                  >
                    <Upload size={12} /> Upload instruction file
                  </label>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => onRemove(idx)}
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function queueChecklistInstructionFile(
  prev: Record<number, File[]>,
  index: number,
  file: File,
): Record<number, File[]> {
  return appendChecklistFileToMap(prev, index, file);
}
