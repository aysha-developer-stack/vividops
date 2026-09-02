import { Download } from "lucide-react";
import PreviewableImage from "@/components/PreviewableImage";
import {
  attachmentExtension,
  canPreviewAttachment,
  isHeicAttachment,
  isPreviewableImageAttachment,
} from "@/lib/attachmentPreview";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  fileType?: string | null;
  previewUrl: string;
  onDownload?: () => void;
};

export function canOpenAttachmentPreview(fileName: string, fileType?: string | null): boolean {
  return canPreviewAttachment(fileName, fileType);
}

/** Fixed-height pane — scroll happens inside iframe/video viewer only (avoids nested scroll jank). */
const EMBEDDED_VIEWER_CLASS =
  "h-[min(82vh,calc(92vh-7rem))] min-h-[360px] flex-1 shrink-0 overflow-hidden rounded-xl border border-gray-100 bg-gray-50";

/** Scrollable pane for tall images — single scroll container with smooth overscroll. */
const IMAGE_SCROLL_CLASS =
  "max-h-[min(82vh,calc(92vh-7rem))] min-h-[360px] flex-1 overflow-y-auto overscroll-contain rounded-xl border border-gray-100 bg-gray-50 [overflow-anchor:none] [-webkit-overflow-scrolling:touch]";

export default function AttachmentPreviewDialog({
  open,
  onOpenChange,
  fileName,
  fileType,
  previewUrl,
  onDownload,
}: Props) {
  const ext = attachmentExtension(fileName);
  const isImage = isPreviewableImageAttachment(fileName, fileType);
  const isPdf = ext === "pdf" || fileType === "application/pdf";
  const isText = ext === "txt" || (fileType || "").startsWith("text/");
  const isVideo =
    ["mp4", "mov", "webm", "m4v"].includes(ext) || (fileType || "").startsWith("video/");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-[min(96vw,1600px)] flex-col gap-3 overflow-hidden p-4 sm:p-5">
        <div className="flex shrink-0 items-start justify-between gap-4 pr-8">
          <DialogHeader className="min-w-0 flex-1 space-y-1 text-left">
            <DialogTitle className="truncate pr-2">{fileName || "File preview"}</DialogTitle>
            <DialogDescription>
              Preview opens inside Vivid OPS. Use Download to save the file.
            </DialogDescription>
          </DialogHeader>
          {onDownload ? (
            <button
              type="button"
              className="mt-0.5 inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
              onClick={onDownload}
            >
              <Download size={16} />
              Download
            </button>
          ) : null}
        </div>

        {isImage ? (
          <div className={IMAGE_SCROLL_CLASS}>
            {isHeicAttachment(fileName, fileType) ? (
              <PreviewableImage
                src={previewUrl}
                fileName={fileName}
                fileType={fileType}
                alt={fileName}
                className="max-w-full mx-auto block"
              />
            ) : (
              <img
                src={previewUrl}
                alt={fileName}
                className="max-w-full mx-auto block"
                decoding="async"
                fetchPriority="high"
              />
            )}
          </div>
        ) : isPdf || isText ? (
          <div className={EMBEDDED_VIEWER_CLASS}>
            <iframe
              src={previewUrl}
              title={fileName}
              className="h-full w-full border-0 bg-white"
            />
          </div>
        ) : isVideo ? (
          <div className={`${EMBEDDED_VIEWER_CLASS} flex items-center justify-center bg-black`}>
            <video src={previewUrl} controls className="max-h-full max-w-full" />
          </div>
        ) : (
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-8 text-center text-sm text-gray-500">
            Preview is not available for this file type.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
