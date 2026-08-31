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
  DialogFooter,
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

export default function AttachmentPreviewDialog({
  open,
  onOpenChange,
  fileName,
  fileType,
  previewUrl,
  onDownload,
}: Props) {
  const ext = attachmentExtension(fileName);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw]">
        <DialogHeader>
          <DialogTitle>{fileName || "File preview"}</DialogTitle>
          <DialogDescription>Preview opens inside Vivid OPS. Use Download to save the file.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[75vh] overflow-auto rounded-xl border border-gray-100 bg-gray-50">
          {isPreviewableImageAttachment(fileName, fileType) ? (
            isHeicAttachment(fileName, fileType) ? (
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
            )
          ) : ext === "pdf" || fileType === "application/pdf" ? (
            <iframe src={previewUrl} title={fileName} className="w-full h-[75vh] bg-white" />
          ) : ext === "txt" || (fileType || "").startsWith("text/") ? (
            <iframe src={previewUrl} title={fileName} className="w-full h-[75vh] bg-white" />
          ) : ["mp4", "mov", "webm", "m4v"].includes(ext) || (fileType || "").startsWith("video/") ? (
            <video src={previewUrl} controls className="w-full max-h-[75vh] bg-black mx-auto block" />
          ) : (
            <div className="p-8 text-center text-sm text-gray-500">
              Preview is not available for this file type.
            </div>
          )}
        </div>
        {onDownload && (
          <DialogFooter>
            <button
              type="button"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
              onClick={onDownload}
            >
              Download
            </button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
