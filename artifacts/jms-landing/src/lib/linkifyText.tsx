import type { ReactNode } from "react";

const URL_REGEX = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;

export function hasLinkifiableUrl(text: string): boolean {
  URL_REGEX.lastIndex = 0;
  return URL_REGEX.test(text);
}

export function extractLinkifiableUrls(text: string): string[] {
  URL_REGEX.lastIndex = 0;
  const urls = new Set<string>();
  for (const match of text.matchAll(URL_REGEX)) {
    urls.add(splitUrl(match[0]).href);
  }
  return Array.from(urls);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function splitUrl(raw: string): { href: string; display: string; trailing: string } {
  let href = raw;
  let trailing = "";
  while (/[.,;:!?)]+$/.test(href)) {
    trailing = href.slice(-1) + trailing;
    href = href.slice(0, -1);
  }
  const normalizedHref = href.startsWith("www.") ? `https://${href}` : href;
  return { href: normalizedHref, display: href, trailing };
}

export function extractPlainText(text: string): string {
  return text.replace(/\u00a0/g, " ");
}

/** @deprecated use extractPlainText while editing */
export function normalizePlainText(text: string): string {
  return extractPlainText(text);
}

export function trimTrailingNewlines(text: string): string {
  return text.replace(/\n+$/, "");
}

const LINK_ANCHOR_STYLE =
  "color:#0284c7;text-decoration:underline;text-underline-offset:2px;word-break:break-all;cursor:pointer;";

export function plainTextToHtml(text: string): string {
  if (!text) return "";
  return escapeHtml(text).replace(/\n/g, "<br>");
}

export function linkifyToHtml(text: string): string {
  if (!text) return "";

  const parts: string[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_REGEX)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      parts.push(escapeHtml(text.slice(lastIndex, start)).replace(/\n/g, "<br>"));
    }

    const raw = match[0];
    const { href, display, trailing } = splitUrl(raw);
    parts.push(
      `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="${LINK_ANCHOR_STYLE}">${escapeHtml(display)}</a>`,
    );
    if (trailing) parts.push(escapeHtml(trailing));

    lastIndex = start + raw.length;
  }

  if (lastIndex < text.length) {
    parts.push(escapeHtml(text.slice(lastIndex)).replace(/\n/g, "<br>"));
  }

  return parts.join("");
}

export function linkifyText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_REGEX)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start));
    }

    const raw = match[0];
    const { href, display, trailing } = splitUrl(raw);
    nodes.push(
      <a
        key={`${start}-${href}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: "#0284c7",
          textDecoration: "underline",
          textUnderlineOffset: "2px",
          wordBreak: "break-all",
        }}
      >
        {display}
      </a>,
    );
    if (trailing) nodes.push(trailing);

    lastIndex = start + raw.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

export function LinkifiedText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return <span className={className}>{linkifyText(text)}</span>;
}
