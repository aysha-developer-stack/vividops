import { supabase, getBucketName, downloadStorageBuffer } from "./storage";
import { convertHeicBufferToJpeg } from "./heic-preview";

function previewCacheKey(attachmentId: string): string {
  return `previews/${attachmentId}.jpg`;
}

/** Return cached JPEG preview for HEIC, converting and storing on first request. */
export async function getHeicPreviewJpeg(attachmentId: string, fileKey: string): Promise<Buffer> {
  const bucket = getBucketName();
  const cacheKey = previewCacheKey(attachmentId);

  const { data: cached, error: cacheError } = await supabase.storage.from(bucket).download(cacheKey);
  if (cached && !cacheError) {
    return Buffer.from(await cached.arrayBuffer());
  }

  const original = await downloadStorageBuffer(fileKey);
  const jpeg = await convertHeicBufferToJpeg(original);

  void supabase.storage
    .from(bucket)
    .upload(cacheKey, jpeg, {
      contentType: "image/jpeg",
      upsert: true,
      cacheControl: "31536000",
    })
    .catch(() => {});

  return jpeg;
}
