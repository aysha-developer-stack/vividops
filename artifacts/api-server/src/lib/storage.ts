import { createClient } from "@supabase/supabase-js";
import multer from "multer";
import { randomUUID } from "crypto";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const supabase = createClient(supabaseUrl, supabaseServiceKey);

const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "video/mp4",
  "video/quicktime",
  "application/octet-stream", // Allow generic binary, we'll check extension
];

const ALLOWED_EXTENSIONS = [
  ".png", ".jpg", ".jpeg", ".webp", ".heic",
  ".pdf",
  ".doc", ".docx",
  ".ppt", ".pptx",
  ".txt",
  ".mp4", ".mov",
];

// Use memory storage for multer since we'll upload to Supabase manually
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (_req, _file, cb) => {
    // Accept all file types
    cb(null, true);
  },
});

function safePathSegment(input: string, fallback: string) {
  const raw = (input ?? "").toString().trim();
  const cleaned = raw
    .replace(/[/\\]/g, "-")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, 80);
  return cleaned || fallback;
}

function normalizePrefix(prefix: string) {
  const raw = prefix.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  if (!raw) return "";
  return raw
    .split("/")
    .map((p) => safePathSegment(p, "x"))
    .join("/");
}

export async function uploadToSupabase(file: Express.Multer.File, options?: { prefix?: string }) {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  }
  const bucketName = getBucketName();
  const key = buildStorageObjectKey(file.originalname, options?.prefix);
  
  // Let Supabase detect content type automatically - don't restrict it
  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(key, file.buffer, {
      upsert: false,
      contentType: file.mimetype || "application/octet-stream",
    });

  if (error) {
    throw new Error(typeof (error as any)?.message === "string" ? (error as any).message : "Supabase upload failed");
  }

  return {
    key: data.path,
    location: getPublicUrlForKey(data.path),
  };
}

export function getBucketName() {
  return process.env.SUPABASE_STORAGE_BUCKET || "vivid-ops-files";
}

export function buildStorageObjectKey(fileName: string, prefix?: string) {
  const safeOriginalName = safePathSegment(fileName, "file");
  const normalizedPrefix = prefix ? normalizePrefix(prefix) : "";
  return `${normalizedPrefix ? `${normalizedPrefix}/` : ""}${Date.now()}-${randomUUID()}-${safeOriginalName}`;
}

export function getPublicUrlForKey(key: string) {
  const bucketName = getBucketName();
  const { data: { publicUrl } } = supabase.storage.from(bucketName).getPublicUrl(key);
  return publicUrl;
}

export async function createDirectUploadUrl(storageKey: string) {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  }
  const bucketName = getBucketName();
  const { data, error } = await supabase.storage
    .from(bucketName)
    .createSignedUploadUrl(storageKey);

  if (error || !data) {
    throw new Error(
      typeof (error as { message?: string } | null)?.message === "string"
        ? (error as { message: string }).message
        : "Failed to create signed upload URL",
    );
  }

  return {
    signedUrl: data.signedUrl,
    token: data.token,
    path: data.path,
  };
}

export async function storageObjectExists(storageKey: string): Promise<boolean> {
  const bucketName = getBucketName();
  const folder = storageKey.includes("/") ? storageKey.slice(0, storageKey.lastIndexOf("/")) : "";
  const name = storageKey.includes("/") ? storageKey.slice(storageKey.lastIndexOf("/") + 1) : storageKey;
  const { data, error } = await supabase.storage.from(bucketName).list(folder, {
    limit: 100,
    search: name,
  });
  if (error) return false;
  return (data ?? []).some((item) => item.name === name);
}
