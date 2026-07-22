import { useCallback, useRef, useState, type DragEvent, type ReactNode } from "react";
import { FolderOpen, Loader2, Upload } from "lucide-react";
import { collectFilesFromDataTransfer, collectFilesFromList, filterFilesByAccept } from "@/lib/collectDroppedFiles";

type FileDropzoneProps = {
  onFiles: (files: File[]) => void | Promise<void>;
  multiple?: boolean;
  accept?: string;
  disabled?: boolean;
  /** Allow choosing an entire folder via the browse dialog (Chrome/Edge). Default: same as multiple. */
  allowFolders?: boolean;
  label?: string;
  hint?: string;
  compact?: boolean;
  className?: string;
  busy?: boolean;
  children?: ReactNode;
};

export default function FileDropzone({
  onFiles,
  multiple = true,
  accept,
  disabled = false,
  allowFolders = multiple,
  label,
  hint,
  compact = false,
  className = "",
  busy = false,
  children,
}: FileDropzoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const isBusy = busy || localBusy;
  const isDisabled = disabled || isBusy;

  const emitFiles = useCallback(
    async (files: File[]) => {
      if (isDisabled || files.length === 0) return;
      const accepted = filterFilesByAccept(files, accept);
      if (accepted.length === 0) {
        window.alert(
          accept
            ? `Only these file types are allowed: ${accept.split(",").map((t) => t.trim()).filter((t) => t.startsWith(".")).join(", ") || accept}`
            : "No valid files selected.",
        );
        return;
      }
      const next = multiple ? accepted : accepted.slice(0, 1);
      setLocalBusy(true);
      try {
        await onFiles(next);
      } finally {
        setLocalBusy(false);
      }
    },
    [accept, isDisabled, multiple, onFiles],
  );

  const onDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDisabled) return;
    if (Array.from(e.dataTransfer.types).includes("Files")) setDragging(true);
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDisabled) return;
    e.dataTransfer.dropEffect = "copy";
    if (!dragging) setDragging(true);
  };

  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = e.relatedTarget as Node | null;
    if (next && e.currentTarget.contains(next)) return;
    setDragging(false);
  };

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    if (isDisabled) return;
    const files = await collectFilesFromDataTransfer(e.dataTransfer);
    await emitFiles(files);
  };

  const title =
    label ??
    (dragging
      ? "Drop files or folders here"
      : multiple
        ? "Drag & drop files or folders here"
        : "Drag & drop a file here");

  const subtitle =
    hint ??
    (multiple
      ? "Click to browse files, or use Upload folder · multiple files and folders supported"
      : "Click to browse");

  return (
    <div className={className}>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple={multiple}
        accept={accept}
        disabled={isDisabled}
        onChange={(e) => {
          const files = collectFilesFromList(e.target.files);
          e.target.value = "";
          void emitFiles(files);
        }}
      />
      {allowFolders && (
        <input
          ref={folderInputRef}
          type="file"
          className="hidden"
          multiple
          disabled={isDisabled}
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
          onChange={(e) => {
            const files = collectFilesFromList(e.target.files);
            e.target.value = "";
            void emitFiles(files);
          }}
        />
      )}

      <div
        role="button"
        tabIndex={isDisabled ? -1 : 0}
        aria-disabled={isDisabled}
        onClick={() => {
          if (!isDisabled) fileInputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if (isDisabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={(e) => void onDrop(e)}
        className={`rounded-xl border-2 border-dashed text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
          compact ? "px-3 py-4" : "px-4 py-6"
        } ${
          isDisabled
            ? "opacity-60 cursor-not-allowed border-gray-200 bg-gray-50"
            : dragging
              ? "border-primary bg-primary/10 cursor-copy"
              : "border-gray-200 bg-gray-50 hover:bg-primary/5 hover:border-primary/40 cursor-pointer"
        }`}
      >
        <div
          className={`${compact ? "w-8 h-8" : "w-10 h-10"} rounded-xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-2`}
        >
          {isBusy ? <Loader2 size={compact ? 14 : 18} className="animate-spin" /> : <Upload size={compact ? 14 : 18} />}
        </div>
        <div className={`${compact ? "text-[11px]" : "text-xs"} font-semibold text-gray-700`}>
          {isBusy ? "Uploading…" : title}
        </div>
        <div className="text-[10px] text-gray-500 mt-1">{subtitle}</div>
        {children}
      </div>

      {allowFolders && !isDisabled && (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              folderInputRef.current?.click();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-primary bg-primary/5 hover:bg-primary/10 border border-primary/15"
          >
            <FolderOpen size={12} />
            Upload folder
          </button>
        </div>
      )}
    </div>
  );
}
