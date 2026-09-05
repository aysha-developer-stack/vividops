import { useEffect, useState } from "react";
import { attachmentPreviewProxyUrl } from "@/lib/attachmentPreview";

type Props = {
  previewUrl: string;
};

function proxiedPdfUrl(url: string): string {
  if (!url.includes("/view")) return url;
  return attachmentPreviewProxyUrl(url);
}

export default function PdfDocumentPreview({ previewUrl }: Props) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let revokeUrl: string | null = null;
    setLoading(true);
    setError(null);
    setObjectUrl(null);

    void (async () => {
      try {
        const url = proxiedPdfUrl(previewUrl);
        const response = await fetch(url, { credentials: "include" });
        if (!response.ok) {
          throw new Error(`Could not load PDF (${response.status})`);
        }
        const blob = await response.blob();
        if (cancelled) return;
        if (blob.size === 0) {
          throw new Error("PDF file is empty.");
        }
        const typed =
          blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" });
        const nextUrl = URL.createObjectURL(typed);
        revokeUrl = nextUrl;
        setObjectUrl(nextUrl);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not preview this PDF.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
    };
  }, [previewUrl]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
        Loading PDF preview…
      </div>
    );
  }

  if (error || !objectUrl) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-gray-500">
        {error ?? "Could not preview this PDF. Use Download to open the file."}
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-gray-200 bg-[#525659]">
      <iframe
        src={objectUrl}
        title="PDF preview"
        className="absolute inset-0 h-full w-full border-0 bg-[#525659]"
      />
    </div>
  );
}
