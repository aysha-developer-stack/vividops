import { useEffect, useState } from "react";
import { attachmentPreviewProxyUrl } from "@/lib/attachmentPreview";

type Props = {
  previewUrl: string;
};

function proxiedDocxUrl(url: string): string {
  if (!url.includes("/view")) return url;
  return attachmentPreviewProxyUrl(url);
}

export default function WordDocumentPreview({ previewUrl }: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setHtml(null);

    void (async () => {
      try {
        const url = proxiedDocxUrl(previewUrl);
        const response = await fetch(url, { credentials: "include" });
        if (!response.ok) {
          throw new Error(`Could not load document (${response.status})`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const { default: mammoth } = await import("mammoth");
        const result = await mammoth.convertToHtml({ arrayBuffer });
        if (cancelled) return;
        setHtml(result.value);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not preview this document.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [previewUrl]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
        Loading document preview…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-gray-500">
        {error}
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white [overflow-anchor:none] [-webkit-overflow-scrolling:touch]">
      <div
        className="mx-auto max-w-3xl p-6 text-gray-900 sm:p-8 [&_h1]:mb-4 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_img]:max-w-full [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-gray-200 [&_td]:p-2 [&_th]:border [&_th]:border-gray-200 [&_th]:p-2 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6"
        dangerouslySetInnerHTML={{ __html: html ?? "" }}
      />
    </div>
  );
}
