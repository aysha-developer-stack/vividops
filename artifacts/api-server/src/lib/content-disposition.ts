/** Build Content-Disposition so commas/spaces stay literal in the saved filename. */
export function contentDispositionHeader(
  disposition: "inline" | "attachment",
  rawName: string,
): string {
  const name =
    (rawName || "file").split(/[/\\]/).pop()?.replace(/[\r\n"]+/g, "_").trim() || "file";
  const needsRfc5987 = /[^\x20-\x7E]/.test(name);
  if (!needsRfc5987) {
    return `${disposition}; filename="${name}"`;
  }
  const asciiName = name.replace(/[^\x20-\x7E]+/g, "_") || "file";
  const encodedName = encodeURIComponent(name).replace(/['()]/g, escape);
  return `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodedName}`;
}
