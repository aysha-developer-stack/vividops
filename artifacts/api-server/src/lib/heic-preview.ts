export function isHeicAttachment(fileName: string, fileType?: string | null): boolean {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return true;
  const mime = (fileType || "").toLowerCase();
  return mime === "image/heic" || mime === "image/heif";
}

/** JPEG quality for preview conversion — lower = smaller/faster (preview only). */
const PREVIEW_JPEG_QUALITY = 0.82;

export async function convertHeicBufferToJpeg(
  input: Buffer,
  quality = PREVIEW_JPEG_QUALITY,
): Promise<Buffer> {
  const mod = await import("heic-convert");
  const convert = (mod as { default?: (opts: { buffer: Buffer; format: "JPEG"; quality: number }) => Promise<ArrayBuffer> }).default;
  if (!convert) {
    throw new Error("HEIC converter unavailable");
  }
  const out = await convert({
    buffer: input,
    format: "JPEG",
    quality,
  });
  return Buffer.from(out);
}
