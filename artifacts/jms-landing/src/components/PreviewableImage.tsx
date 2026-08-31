import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { isPreviewableImageAttachment, resolveImagePreviewSrc } from "@/lib/attachmentPreview";

type Props = {
  src: string;
  fileName: string;
  fileType?: string | null;
  alt: string;
  className?: string;
};

export default function PreviewableImage({ src, fileName, fileType, alt, className }: Props) {
  const [displaySrc, setDisplaySrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPreviewableImageAttachment(fileName, fileType)) {
      setDisplaySrc(null);
      setLoading(false);
      setError("Unsupported image type");
      return;
    }

    let revokeUrl: string | null = null;
    let cancelled = false;

    setLoading(true);
    setError(null);
    setDisplaySrc(null);

    void resolveImagePreviewSrc(src, fileName, fileType)
      .then(({ src: nextSrc, revoke }) => {
        if (cancelled) {
          if (revoke) URL.revokeObjectURL(nextSrc);
          return;
        }
        revokeUrl = revoke ? nextSrc : null;
        setDisplaySrc(nextSrc);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load image preview");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
    };
  }, [src, fileName, fileType]);

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center gap-2 p-8 text-sm text-gray-500">
        <Loader2 size={16} className="animate-spin" />
        Loading preview…
      </div>
    );
  }

  if (error || !displaySrc) {
    return (
      <div className="p-8 text-center text-sm text-gray-500">
        {error ?? "Preview is not available for this image."}
      </div>
    );
  }

  return (
    <img
      src={displaySrc}
      alt={alt}
      className={className}
      onError={() => setError("Could not load image preview")}
    />
  );
}
