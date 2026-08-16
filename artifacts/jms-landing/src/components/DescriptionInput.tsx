import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  extractPlainText,
  hasLinkifiableUrl,
  linkifyToHtml,
  trimTrailingNewlines,
} from "@/lib/linkifyText";

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
          return;
        }
      }
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
      if (found) return;
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

type DescriptionInputProps = {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  className?: string;
};

export default function DescriptionInput({
  value,
  onChange,
  rows = 2,
  className,
}: DescriptionInputProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const focusedRef = useRef(false);
  const lastRenderedRef = useRef(value);
  const linkifyTimerRef = useRef<number | null>(null);

  const renderHtml = (text: string, caret?: number) => {
    const editor = editorRef.current;
    if (!editor) return;

    const offset =
      caret ?? (document.activeElement === editor ? getCaretOffset(editor) : undefined);
    editor.innerHTML = linkifyToHtml(text) || "<br>";

    if (offset !== undefined && document.activeElement === editor) {
      setCaretOffset(editor, Math.min(offset, extractPlainText(editor.innerText).length));
    }
  };

  useEffect(() => {
    if (focusedRef.current || !editorRef.current) return;
    if (value === lastRenderedRef.current) return;
    lastRenderedRef.current = value;
    renderHtml(value);
  }, [value]);

  useEffect(() => {
    renderHtml(value);
    lastRenderedRef.current = value;
    return () => {
      if (linkifyTimerRef.current !== null) {
        window.clearTimeout(linkifyTimerRef.current);
      }
    };
  }, []);

  const syncFromEditor = (linkifyNow = false) => {
    const editor = editorRef.current;
    if (!editor) return;

    const plain = extractPlainText(editor.innerText);
    lastRenderedRef.current = plain;
    onChange(plain);

    if (linkifyTimerRef.current !== null) {
      window.clearTimeout(linkifyTimerRef.current);
      linkifyTimerRef.current = null;
    }

    if (!hasLinkifiableUrl(plain)) return;

    const runLinkify = () => {
      if (!editorRef.current) return;
      const current = extractPlainText(editorRef.current.innerText);
      renderHtml(current, getCaretOffset(editorRef.current));
    };

    if (linkifyNow) {
      runLinkify();
      return;
    }

    linkifyTimerRef.current = window.setTimeout(runLinkify, 400);
  };

  return (
    <div
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      onInput={() => syncFromEditor(false)}
      onBlur={() => {
        focusedRef.current = false;
        const editor = editorRef.current;
        if (!editor) return;
        const plain = trimTrailingNewlines(extractPlainText(editor.innerText));
        lastRenderedRef.current = plain;
        onChange(plain);
        if (hasLinkifiableUrl(plain)) {
          renderHtml(plain);
        }
      }}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onPaste={(event) => {
        event.preventDefault();
        const text = event.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, text);
        syncFromEditor(true);
      }}
      onMouseDown={(event) => {
        const anchor = (event.target as HTMLElement).closest("a");
        if (anchor instanceof HTMLAnchorElement) {
          event.preventDefault();
        }
      }}
      onClick={(event) => {
        const anchor = (event.target as HTMLElement).closest("a");
        if (anchor instanceof HTMLAnchorElement) {
          event.preventDefault();
          window.open(anchor.href, "_blank", "noopener,noreferrer");
        }
      }}
      className={cn(
        "w-full min-w-0 px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-primary focus:bg-white transition-colors overflow-auto whitespace-pre-wrap break-words",
        "empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400",
        className,
      )}
      style={{ minHeight: `${rows * 1.5}rem` }}
      data-placeholder="Add description or paste a link..."
    />
  );
}
