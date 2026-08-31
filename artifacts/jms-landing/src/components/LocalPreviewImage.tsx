import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { resolveLocalImagePreviewSrc } from "@/lib/attachmentPreview";

type Props = {
  file: File;
  alt: string;
  className?: string;
};

export default function LocalPreviewImage({ file, alt, className }: Props) {
  const [displaySrc, setDisplaySrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let revokeUrl: string | null = null;
    let cancelled = false;

    setLoading(true);
    setDisplaySrc(null);

    void resolveLocalImagePreviewSrc(file)
      .then(({ src, revoke }) => {
        if (cancelled) {
          if (revoke) URL.revokeObjectURL(src);
          return;
        }
        revokeUrl = revoke ? src : null;
        setDisplaySrc(src);
      })
      .catch(() => {
        if (!cancelled) setDisplaySrc(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
    };
  }, [file]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 ${className ?? ""}`}>
        <Loader2 size={14} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (!displaySrc) {
    return <div className={`bg-gray-100 ${className ?? ""}`} aria-hidden />;
  }

  return <img src={displaySrc} alt={alt} className={className} />;
}
