import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { extractLinkifiableUrls, LinkifiedText } from "@/lib/linkifyText";

type DescriptionInputProps = {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  className?: string;
};

const fieldClass =
  "px-3 py-2.5 text-sm leading-6 whitespace-pre-wrap break-words";

export default function DescriptionInput({
  value,
  onChange,
  rows = 3,
  className,
}: DescriptionInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const links = extractLinkifiableUrls(value);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  return (
    <div
      className={cn(
        "w-full min-w-0 rounded-xl border-2 border-gray-200 bg-gray-50 text-gray-900 transition-colors focus-within:border-primary focus-within:bg-white",
        className,
      )}
    >
      <div className="grid [&>*]:col-start-1 [&>*]:row-start-1">
        <div aria-hidden className={cn(fieldClass, "text-gray-900 pointer-events-none")}>
          {value ? (
            <LinkifiedText text={value} />
          ) : (
            <span className="text-gray-400">Add description or paste a link...</span>
          )}
        </div>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={rows}
          spellCheck
          className={cn(
            fieldClass,
            "resize-none overflow-hidden border-0 bg-transparent text-transparent caret-gray-900 outline-none",
          )}
          style={{ WebkitTextFillColor: "transparent" }}
        />
      </div>
      {links.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 shrink-0">
            Open
          </span>
          {links.map((href) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-primary underline underline-offset-2 hover:text-primary/80 break-all"
            >
              {href}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
