import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { linkifyToHtml } from "@/lib/linkifyText";

type DescriptionInputProps = {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  className?: string;
};

const fieldClass =
  "w-full px-3 py-2.5 text-sm leading-6 whitespace-pre-wrap break-words";

export default function DescriptionInput({
  value,
  onChange,
  rows = 4,
  className,
}: DescriptionInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  const syncScroll = () => {
    if (mirrorRef.current && textareaRef.current) {
      mirrorRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  return (
    <div
      className={cn(
        "grid w-full min-w-0 rounded-xl border-2 border-gray-200 bg-gray-50 text-gray-900 transition-colors focus-within:border-primary focus-within:bg-white",
        className,
      )}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onScroll={syncScroll}
        rows={rows}
        placeholder=""
        spellCheck
        className={cn(
          fieldClass,
          "col-start-1 row-start-1 z-0 resize-none overflow-hidden border-0 bg-transparent outline-none",
        )}
        style={{
          color: "transparent",
          WebkitTextFillColor: "transparent",
          caretColor: "#111827",
        }}
      />
      <div
        ref={mirrorRef}
        aria-hidden
        className={cn(
          fieldClass,
          "col-start-1 row-start-1 z-10 pointer-events-none select-none overflow-hidden text-gray-900",
        )}
        dangerouslySetInnerHTML={{
          __html: value
            ? linkifyToHtml(value)
            : '<span style="color:#9ca3af">Type notes here. Paste links.</span>',
        }}
      />
    </div>
  );
}

function isLikelyUrl(value: string): boolean {
  const trimmed = value.trim();
  return /^(?:https?:\/\/|www\.)/i.test(trimmed);
}

export function AddressUrlHint({ value }: { value: string }) {
  if (!isLikelyUrl(value)) return null;
  return (
    <p className="mt-1 text-xs text-amber-700">
      This looks like a web link. Paste links in <strong>Description</strong> instead of Job Address.
    </p>
  );
}
