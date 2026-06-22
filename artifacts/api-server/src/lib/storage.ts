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
  const bucketName = process.env.SUPABASE_STORAGE_BUCKET || "vivid-ops-files";
  const safeOriginalName = safePathSegment(file.originalname, "file");
  const prefix = options?.prefix ? normalizePrefix(options.prefix) : "";
  const key = `${prefix ? `${prefix}/` : ""}${Date.now()}-${randomUUID()}-${safeOriginalName}`;
  
  // Let Supabase detect content type automatically - don't restrict it
  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(key, file.buffer, {
      upsert: false,
    });

  if (error) {
    throw new Error(typeof (error as any)?.message === "string" ? (error as any).message : "Supabase upload failed");
  }

  const { data: { publicUrl } } = supabase.storage
    .from(bucketName)
    .getPublicUrl(data.path);

  return {
    key: data.path,
    location: publicUrl,
  };
}
