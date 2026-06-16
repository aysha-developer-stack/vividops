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
];

// Use memory storage for multer since we'll upload to Supabase manually
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Only images, PDFs, Word docs, and small videos are allowed.`));
    }
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
  const bucketName = process.env.SUPABASE_STORAGE_BUCKET || "vivid-ops-files";
  const safeOriginalName = safePathSegment(file.originalname, "file");
  const prefix = options?.prefix ? normalizePrefix(options.prefix) : "";
  const key = `${prefix ? `${prefix}/` : ""}${Date.now()}-${randomUUID()}-${safeOriginalName}`;
  const contentType =
    file.mimetype === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    file.mimetype === "application/vnd.ms-powerpoint"
      ? "application/octet-stream"
      : file.mimetype;
  
  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(key, file.buffer, {
      contentType,
      upsert: false,
    });

  if (error) {
    throw error;
  }

  const { data: { publicUrl } } = supabase.storage
    .from(bucketName)
    .getPublicUrl(data.path);

  return {
    key: data.path,
    location: publicUrl,
  };
}
