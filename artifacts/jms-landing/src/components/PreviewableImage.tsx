import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { imagePreviewSrc, isPreviewableImageAttachment } from "@/lib/attachmentPreview";

type Props = {
  src: string;
  fileName: string;
  fileType?: string | null;
  alt: string;
  className?: string;
  /** Use for grid thumbnails — defers load until near viewport. */
  lazy?: boolean;
  /** Smaller loader for thumbnails. */
  compact?: boolean;
};

export default function PreviewableImage({
  src,
  fileName,
  fileType,
  alt,
  className,
  lazy = false,
  compact = false,
}: Props) {
  const displaySrc = useMemo(() => imagePreviewSrc(src, fileName, fileType), [src, fileName, fileType]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  if (!isPreviewableImageAttachment(fileName, fileType)) {
    return (
      <div className={`flex items-center justify-center text-xs text-gray-400 ${className ?? ""}`}>
        Unsupported
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`flex items-center justify-center text-center text-xs text-gray-500 ${compact ? "p-2" : "p-8"} ${className ?? ""}`}
      >
        Could not load preview
      </div>
    );
  }

  return (
    <div className={`relative ${compact ? "" : "min-h-[120px]"}`}>
      {!loaded && (
        <div
          className={`absolute inset-0 flex items-center justify-center bg-gray-50/80 ${compact ? "" : "min-h-[200px]"}`}
        >
          <Loader2 size={compact ? 14 : 16} className="animate-spin text-gray-400" />
        </div>
      )}
      <img
        src={displaySrc}
        alt={alt}
        className={className}
        loading={lazy ? "lazy" : "eager"}
        decoding="async"
        fetchPriority={lazy ? "low" : "high"}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
    </div>
  );
}
