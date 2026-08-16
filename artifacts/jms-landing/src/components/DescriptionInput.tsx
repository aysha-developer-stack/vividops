import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  extractPlainText,
  hasLinkifiableUrl,
  linkifyToHtml,
  trimTrailingNewlines,
} from "@/lib/linkifyText";

type DescriptionInputProps = {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  className?: string;
};

function getCaretOffset(root: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return 0;

  const range = selection.getRangeAt(0);
  let offset = 0;
  let found = false;

  const walk = (node: Node): void => {
    if (found) return;

    if (node === range.endContainer) {
      if (node.nodeType === Node.TEXT_NODE) {
        offset += range.endOffset;
        found = true;
        return;
      }
      if (node === root) {
        const child = node.childNodes[range.endOffset - 1];
        if (child?.nodeName === "BR") {
          offset += 1;
          found = true;
        }
      }
      return;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      offset += node.textContent?.length ?? 0;
      return;
    }

    if (node.nodeName === "BR") {
      offset += 1;
      return;
    }

    for (let child = node.firstChild; child; child = child.nextSibling) {
      walk(child);
    }
  };

  walk(root);
  return offset;
}

function setCaretOffset(root: HTMLElement, offset: number) {
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  let current = 0;
  let placed = false;

  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length ?? 0;
      if (current + length >= offset) {
        range.setStart(node, offset - current);
        range.collapse(true);
        placed = true;
        return true;
      }
      current += length;
      return false;
    }

    if (node.nodeName === "BR") {
      if (current + 1 >= offset) {
        range.setStartAfter(node);
        range.collapse(true);
        placed = true;
        return true;
      }
      current += 1;
      return false;
    }

    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (walk(child)) return true;
    }
    return false;
  };

  if (!walk(root)) {
    range.selectNodeContents(root);
    range.collapse(false);
    placed = true;
  }

  if (placed) {
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

export default function DescriptionInput({
  value,
  onChange,
  rows = 4,
  className,
}: DescriptionInputProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const focusedRef = useRef(false);
  const linkifyTimerRef = useRef<number | null>(null);
  const lastHtmlRef = useRef("");

  const renderLinkified = (text: string, restoreCaret = false) => {
    const editor = editorRef.current;
    if (!editor) return;

    const html = text ? linkifyToHtml(text) : "";
    if (html === lastHtmlRef.current) return;

    const caret = restoreCaret && document.activeElement === editor ? getCaretOffset(editor) : undefined;
    editor.innerHTML = html;
    lastHtmlRef.current = html;

    if (caret !== undefined) {
      setCaretOffset(editor, Math.min(caret, extractPlainText(editor.innerText).length));
    }
  };

  const scheduleLinkify = (text: string) => {
    if (linkifyTimerRef.current !== null) {
      window.clearTimeout(linkifyTimerRef.current);
    }
    if (!hasLinkifiableUrl(text)) return;

    linkifyTimerRef.current = window.setTimeout(() => {
      linkifyTimerRef.current = null;
      if (!editorRef.current) return;
      const current = extractPlainText(editorRef.current.innerText);
      renderLinkified(current, true);
    }, 200);
  };

  useEffect(() => {
    if (focusedRef.current || !editorRef.current) return;
    renderLinkified(value);
  }, [value]);

  useEffect(() => {
    renderLinkified(value);
    return () => {
      if (linkifyTimerRef.current !== null) {
        window.clearTimeout(linkifyTimerRef.current);
      }
    };
  }, []);

  const readPlain = () => {
    const editor = editorRef.current;
    if (!editor) return "";
    return extractPlainText(editor.innerText);
  };

  return (
    <div
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      onInput={() => {
        const plain = readPlain();
        onChange(plain);
        scheduleLinkify(plain);
      }}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={() => {
        focusedRef.current = false;
        if (linkifyTimerRef.current !== null) {
          window.clearTimeout(linkifyTimerRef.current);
          linkifyTimerRef.current = null;
        }
        const plain = trimTrailingNewlines(readPlain());
        onChange(plain);
        renderLinkified(plain);
      }}
      onPaste={(event) => {
        event.preventDefault();
        const text = event.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, text);
        const plain = readPlain();
        onChange(plain);
        renderLinkified(plain, true);
      }}
      onClick={(event) => {
        const anchor = (event.target as HTMLElement).closest("a");
        if (!(anchor instanceof HTMLAnchorElement)) return;
        event.preventDefault();
        window.open(anchor.href, "_blank", "noopener,noreferrer");
      }}
      className={cn(
        "w-full min-w-0 px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm text-gray-900 transition-colors focus:outline-none focus:border-primary focus:bg-white overflow-auto whitespace-pre-wrap break-words",
        "empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400",
        "[&_a]:pointer-events-auto",
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
