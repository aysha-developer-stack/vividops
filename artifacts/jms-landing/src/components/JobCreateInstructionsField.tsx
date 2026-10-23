import { Trash2 } from "lucide-react";
import FileDropzone from "@/components/FileDropzone";
import FileExtensionIcon from "@/components/FileExtensionIcon";
import { JOB_FILE_ACCEPT } from "@/lib/collectDroppedFiles";
import { formatFileSize } from "@/lib/jobForm";

type Props = {
  text: string;
  onTextChange: (value: string) => void;
  files: File[];
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  disabled?: boolean;
};

export default function JobCreateInstructionsField({
  text,
  onTextChange,
  files,
  onAddFiles,
  onRemoveFile,
  disabled = false,
}: Props) {
  return (
    <div className="min-w-0 rounded-xl border border-sky-100 bg-sky-50/50 p-3 space-y-2">
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Instructions for the worker</label>
        <p className="text-[11px] text-gray-500 mb-1.5">
          Text, screenshots, and files are saved to <span className="font-semibold">Notes</span> on this job. The worker sees them there after opening the job.
        </p>
        <textarea
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="e.g. Follow the image — remove these two braces…"
          rows={3}
          disabled={disabled}
          className="w-full min-w-0 px-3 py-2.5 bg-white border-2 border-gray-200 rounded-xl text-sm !text-gray-900 !placeholder:text-gray-400 focus:outline-none focus:border-primary focus:bg-white transition-colors resize-none disabled:opacity-60"
        />
      </div>
      <FileDropzone
        multiple
        compact
        disabled={disabled}
        accept={JOB_FILE_ACCEPT}
        label="Paste or drop instruction images and files"
        hint="Paste a screenshot (Ctrl+V), click to browse, or drop files"
        onFiles={onAddFiles}
      />
      {files.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 text-[10px] font-bold uppercase tracking-wider text-gray-500">
            {files.length} instruction file{files.length === 1 ? "" : "s"}
          </div>
          <div className="divide-y divide-gray-50 max-h-40 overflow-y-auto">
            {files.map((file, index) => (
              <div key={`${file.name}-${file.size}-${index}`} className="px-3 py-2 flex items-center gap-2">
                <FileExtensionIcon fileName={file.name} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-gray-900 break-words leading-snug">{file.name}</div>
                  <div className="text-[11px] text-gray-500">{formatFileSize(file.size)}</div>
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onRemoveFile(index)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
