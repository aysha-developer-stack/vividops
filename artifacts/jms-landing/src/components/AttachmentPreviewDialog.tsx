import { useMemo } from "react";
import { Download } from "lucide-react";
import PreviewableImage from "@/components/PreviewableImage";
import PdfDocumentPreview from "@/components/PdfDocumentPreview";
import WordDocumentPreview from "@/components/WordDocumentPreview";
import {
  attachmentExtension,
  canPreviewAttachment,
  isDocxAttachment,
  isHeicAttachment,
  isLegacyDocAttachment,
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

/** Same-origin proxy avoids redirect quirks and fills the iframe like the native PDF viewer. */
function embeddedPreviewSrc(previewUrl: string): string {
  if (!previewUrl.includes("/view")) return previewUrl;
  if (previewUrl.includes("proxy=1")) return previewUrl;
  return `${previewUrl}${previewUrl.includes("?") ? "&" : "?"}proxy=1`;
}

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
  const isDocx = isDocxAttachment(fileName, fileType);
  const isLegacyDoc = isLegacyDocAttachment(fileName, fileType);

  const iframeSrc = useMemo(
    () => (isText ? embeddedPreviewSrc(previewUrl) : previewUrl),
    [isText, previewUrl],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-h-[92vh] w-[98vw] max-w-[min(98vw,1760px)] flex-col gap-3 overflow-hidden p-4 sm:p-5">
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
          <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-[#525659] [overflow-anchor:none] [-webkit-overflow-scrolling:touch]">
            <div className="flex min-h-full items-start justify-center p-2 sm:p-4">
              {isHeicAttachment(fileName, fileType) ? (
                <PreviewableImage
                  src={previewUrl}
                  fileName={fileName}
                  fileType={fileType}
                  alt={fileName}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <img
                  src={previewUrl}
                  alt={fileName}
                  className="max-h-full max-w-full object-contain"
                  decoding="async"
                  fetchPriority="high"
                />
              )}
            </div>
          </div>
        ) : isPdf ? (
          <PdfDocumentPreview previewUrl={previewUrl} />
        ) : isText ? (
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-gray-200 bg-[#525659]">
            <iframe
              src={iframeSrc}
              title={fileName}
              className="absolute inset-0 h-full w-full border-0 bg-[#525659]"
            />
          </div>
        ) : isVideo ? (
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-gray-200 bg-black">
            <video src={previewUrl} controls className="absolute inset-0 h-full w-full object-contain" />
          </div>
        ) : isDocx ? (
          <WordDocumentPreview previewUrl={previewUrl} />
        ) : isLegacyDoc ? (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-gray-100 bg-gray-50 p-8 text-center text-sm text-gray-500">
            Preview is not available for legacy Word (.doc) files. Use Download to open the file, or
            convert it to .docx.
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-gray-100 bg-gray-50 p-8 text-center text-sm text-gray-500">
            Preview is not available for this file type.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
