import FileExtensionIcon from "@/components/FileExtensionIcon";

export const IMAGE_FILE_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?.*)?$/i;

export type ParsedAttachmentMessage = {
  fileName: string;
  url: string;
  isImage: boolean;
};

function isAttachmentUrl(url: string): boolean {
  return (
    /^https?:\/\/\S+$/i.test(url) ||
    /^\/api\/jobs\/[^/]+\/attachments\/[^/]+\/view(\?.*)?$/i.test(url) ||
    /^\/api\/cliq\/files\/[^/]+\/view(\?.*)?$/i.test(url)
  );
}

export function parseAttachmentMessage(text: string): ParsedAttachmentMessage | null {
  const trimmed = text.trim();
  const [titleLine, ...rest] = trimmed.split("\n");
  const sharedMatch = /^Shared attachment:\s*(.+)$/i.exec(titleLine.trim());
  if (sharedMatch) {
    const url = rest.join("\n").trim();
    if (!isAttachmentUrl(url)) return null;
    const fileName = sharedMatch[1].trim();
    return {
      fileName,
      url,
      isImage: IMAGE_FILE_RE.test(fileName) || IMAGE_FILE_RE.test(url),
    };
  }

  const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
  const urlLine = lines.find((l) => isAttachmentUrl(l));
  if (urlLine) {
    const fileName = lines.find((l) => l !== urlLine) || "Attachment";
    return {
      fileName,
      url: urlLine,
      isImage: IMAGE_FILE_RE.test(fileName) || IMAGE_FILE_RE.test(urlLine),
    };
  }

  if (/^https?:\/\/\S+$/i.test(trimmed) && IMAGE_FILE_RE.test(trimmed)) {
    const fileName = trimmed.split("/").pop()?.split("?")[0] || "Image";
    return { fileName, url: trimmed, isImage: true };
  }

  return null;
}

export function renderMessageText(text: string) {
  const splitRegex = /(https?:\/\/[^\s]+|\/api\/(?:jobs|cliq)\/[^\s]+)/g;
  const urlRegex = /^(https?:\/\/[^\s]+|\/api\/(?:jobs|cliq)\/[^\s]+)$/;
  const lines = text.split("\n");
  return lines.map((line, lineIndex) => (
    <span key={`${lineIndex}-${line}`} className="block whitespace-pre-wrap break-words">
      {line.split(splitRegex).map((part, partIndex) => {
        if (urlRegex.test(part)) {
          return (
            <a
              key={`${lineIndex}-${partIndex}-${part}`}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 break-all"
            >
              {part}
            </a>
          );
        }
        return <span key={`${lineIndex}-${partIndex}-${part}`}>{part}</span>;
      })}
    </span>
  ));
}

type RenderOptions = {
  isMe?: boolean;
  variant?: "chat" | "activity";
};

export function renderMessageBody(text: string, options: RenderOptions = {}) {
  const { isMe = false, variant = "chat" } = options;
  const attachment = parseAttachmentMessage(text);
  if (!attachment) {
    return renderMessageText(text);
  }

  const mediaBorder = isMe ? "border-white/20" : "border-gray-200";
  const openInNewTab = attachment.url.startsWith("http");

  if (attachment.isImage) {
    return (
      <div className="space-y-2">
        <div className={`text-xs font-semibold ${isMe ? "opacity-90" : "text-gray-700"}`}>
          {attachment.fileName}
        </div>
        <a
          href={attachment.url}
          target={openInNewTab ? "_blank" : undefined}
          rel={openInNewTab ? "noopener noreferrer" : undefined}
          className="block"
        >
          <img
            src={attachment.url}
            alt={attachment.fileName}
            className={`block max-h-72 w-auto max-w-full rounded-xl border ${mediaBorder} object-cover bg-white/10`}
            loading="lazy"
          />
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className={`flex items-center gap-2 text-xs font-semibold ${isMe ? "opacity-90" : "text-gray-700"}`}>
        <FileExtensionIcon fileName={attachment.fileName} size={variant === "activity" ? "sm" : "md"} />
        <span className="break-all">{attachment.fileName}</span>
      </div>
      <a
        href={attachment.url}
        target={openInNewTab ? "_blank" : undefined}
        rel={openInNewTab ? "noopener noreferrer" : undefined}
        className={`inline-flex items-center gap-1.5 text-xs font-semibold underline underline-offset-2 break-all ${isMe ? "" : "text-primary"}`}
      >
        Open attachment
      </a>
    </div>
  );
}
