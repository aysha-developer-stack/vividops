const HEIC_EXTENSIONS = new Set(["heic", "heif"]);
const PREVIEWABLE_IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "heic",
  "heif",
  "bmp",
  "tif",
  "tiff",
]);

export function attachmentExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function isHeicAttachment(fileName: string, fileType?: string | null): boolean {
  const ext = attachmentExtension(fileName);
  if (HEIC_EXTENSIONS.has(ext)) return true;
  const mime = (fileType || "").toLowerCase();
  return mime === "image/heic" || mime === "image/heif";
}

export function isPreviewableImageAttachment(fileName: string, fileType?: string | null): boolean {
  const ext = attachmentExtension(fileName);
  if (PREVIEWABLE_IMAGE_EXTENSIONS.has(ext)) return true;
  return (fileType || "").toLowerCase().startsWith("image/");
}

export function canPreviewAttachment(fileName: string, fileType?: string | null): boolean {
  const ext = attachmentExtension(fileName);
  if (
    [
      "png",
      "jpg",
      "jpeg",
      "gif",
      "webp",
      "svg",
      "heic",
      "heif",
      "bmp",
      "tif",
      "tiff",
      "pdf",
      "txt",
      "mp4",
      "mov",
      "webm",
      "m4v",
    ].includes(ext)
  ) {
    return true;
  }
  const mime = (fileType || "").toLowerCase();
  return (
    mime.startsWith("image/") ||
    mime.startsWith("video/") ||
    mime === "application/pdf" ||
    mime.startsWith("text/")
  );
}

/** Convert HEIC/HEIF to a JPEG object URL for browser preview; passthrough for other images. */
export async function resolveImagePreviewSrc(
  url: string,
  fileName: string,
  fileType?: string | null,
): Promise<{ src: string; revoke: boolean }> {
  if (!isHeicAttachment(fileName, fileType)) {
    return { src: url, revoke: false };
  }

  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    throw new Error("Failed to load image for preview");
  }
  const blob = await res.blob();
  const { default: heic2any } = await import("heic2any");
  const converted = await heic2any({
    blob,
    toType: "image/jpeg",
    quality: 0.92,
  });
  const out = Array.isArray(converted) ? converted[0] : converted;
  if (!(out instanceof Blob)) {
    throw new Error("HEIC conversion failed");
  }
  return { src: URL.createObjectURL(out), revoke: true };
}

/** Local File picker preview (review photos, training uploads, etc.). */
export async function resolveLocalImagePreviewSrc(file: File): Promise<{ src: string; revoke: boolean }> {
  if (!isHeicAttachment(file.name, file.type)) {
    return { src: URL.createObjectURL(file), revoke: true };
  }
  const { default: heic2any } = await import("heic2any");
  const converted = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.92,
  });
  const out = Array.isArray(converted) ? converted[0] : converted;
  if (!(out instanceof Blob)) {
    throw new Error("HEIC conversion failed");
  }
  return { src: URL.createObjectURL(out), revoke: true };
}
