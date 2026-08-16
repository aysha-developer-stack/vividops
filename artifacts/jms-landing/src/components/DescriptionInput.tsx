import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  extractPlainText,
  hasLinkifiableUrl,
  linkifyToHtml,
  plainTextToHtml,
  trimTrailingNewlines,
} from "@/lib/linkifyText";

type DescriptionInputProps = {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  className?: string;
};

export default function DescriptionInput({
  value,
  onChange,
  rows = 4,
  className,
}: DescriptionInputProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const focusedRef = useRef(false);
  const skipFocusPlainRef = useRef(false);

  const renderPlain = (text: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.innerHTML = text ? plainTextToHtml(text) : "";
  };

  const renderLinkified = (text: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.innerHTML = text ? linkifyToHtml(text) : "";
  };

  useEffect(() => {
    if (focusedRef.current || !editorRef.current) return;
    renderLinkified(value);
  }, [value]);

  useEffect(() => {
    renderLinkified(value);
  }, []);

  const syncPlain = () => {
    const editor = editorRef.current;
    if (!editor) return "";
    const plain = extractPlainText(editor.innerText);
    onChange(plain);
    return plain;
  };

  return (
    <div
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      onInput={() => {
        syncPlain();
      }}
      onFocus={() => {
        if (skipFocusPlainRef.current) {
          skipFocusPlainRef.current = false;
          return;
        }
        focusedRef.current = true;
        renderPlain(value);
      }}
      onBlur={() => {
        focusedRef.current = false;
        const editor = editorRef.current;
        if (!editor) return;
        const plain = trimTrailingNewlines(extractPlainText(editor.innerText));
        onChange(plain);
        renderLinkified(plain);
      }}
      onPaste={(event) => {
        event.preventDefault();
        const text = event.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, text);
        const plain = syncPlain();
        if (hasLinkifiableUrl(plain)) {
          requestAnimationFrame(() => renderLinkified(plain));
        }
      }}
      onMouseDown={(event) => {
        const anchor = (event.target as HTMLElement).closest("a");
        if (!(anchor instanceof HTMLAnchorElement)) return;
        event.preventDefault();
        skipFocusPlainRef.current = true;
        window.open(anchor.href, "_blank", "noopener,noreferrer");
      }}
      className={cn(
        "w-full min-w-0 px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm text-gray-900 transition-colors focus:outline-none focus:border-primary focus:bg-white overflow-auto whitespace-pre-wrap break-words",
        "empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400",
        "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_a]:hover:text-primary/80 [&_a]:break-all",
        className,
      )}
      style={{ minHeight: `${rows * 1.5 + 1.25}rem` }}
      data-placeholder="Type notes here. Paste links — press Enter for new lines."
    />
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
