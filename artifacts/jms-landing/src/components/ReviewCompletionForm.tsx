import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import LocalPreviewImage from "@/components/LocalPreviewImage";
import {
  MAX_REVIEW_PHOTOS,
  REVIEW_PHOTO_ACCEPT,
  REVIEW_PHOTO_REJECTED_MESSAGE,
  filterReviewPhotoFiles,
} from "@/lib/uploadFileTypes";

export type ReviewCompletionFormLabels = {
  comment: string;
  commentPlaceholder: string;
  photos: string;
};

type Props = {
  comment: string;
  onCommentChange: (value: string) => void;
  photos: File[];
  onPhotosChange: (files: File[]) => void;
  labels: ReviewCompletionFormLabels;
  commentFocusClass?: string;
  disabled?: boolean;
};

export default function ReviewCompletionForm({
  comment,
  onCommentChange,
  photos,
  onPhotosChange,
  labels,
  commentFocusClass = "focus:border-emerald-500",
  disabled = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const addPhotos = (incoming: FileList | File[] | null) => {
    if (!incoming || disabled) return;
    const list = Array.from(incoming);
    const valid = filterReviewPhotoFiles(list);
    if (valid.length !== list.length) {
      setPhotoError(REVIEW_PHOTO_REJECTED_MESSAGE);
    } else {
      setPhotoError(null);
    }
    const merged = [...photos];
    for (const file of valid) {
      if (merged.length >= MAX_REVIEW_PHOTOS) break;
      const duplicate = merged.some(
        (existing) =>
          existing.name === file.name &&
          existing.size === file.size &&
          existing.lastModified === file.lastModified,
      );
      if (!duplicate) merged.push(file);
    }
    if (merged.length > MAX_REVIEW_PHOTOS) {
      setPhotoError(`You can attach up to ${MAX_REVIEW_PHOTOS} photos.`);
      onPhotosChange(merged.slice(0, MAX_REVIEW_PHOTOS));
      return;
    }
    onPhotosChange(merged);
  };

  const removePhoto = (index: number) => {
    if (disabled) return;
    onPhotosChange(photos.filter((_, i) => i !== index));
    setPhotoError(null);
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 block">
          {labels.comment}
        </label>
        <textarea
          value={comment}
          onChange={(e) => onCommentChange(e.target.value)}
          placeholder={labels.commentPlaceholder}
          rows={4}
          disabled={disabled}
          className={`w-full px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-gray-900 !placeholder:text-gray-400 focus:outline-none ${commentFocusClass} focus:bg-white transition-colors resize-none disabled:opacity-60`}
        />
      </div>

      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 block">
          {labels.photos}
        </label>
        <div className="flex flex-wrap gap-2">
          {photos.map((file, index) => (
            <div
              key={`${file.name}-${file.size}-${file.lastModified}`}
              className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-200 bg-gray-50 shrink-0"
            >
              <LocalPreviewImage file={file} alt={file.name} className="w-full h-full object-cover" />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removePhoto(index)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                  aria-label={`Remove ${file.name}`}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
          {photos.length < MAX_REVIEW_PHOTOS && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
              className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 hover:border-primary/40 hover:bg-primary/5 flex flex-col items-center justify-center gap-1 text-gray-500 hover:text-primary transition-colors disabled:opacity-50 shrink-0"
            >
              <ImagePlus size={18} />
              <span className="text-[9px] font-bold uppercase">Add</span>
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={REVIEW_PHOTO_ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            addPhotos(e.target.files);
            e.target.value = "";
          }}
        />
        <p className="text-[10px] text-gray-400 mt-2">
          Optional · JPG, PNG, GIF, WebP, HEIC · up to {MAX_REVIEW_PHOTOS} photos · 10MB each
        </p>
        {photoError && <p className="text-[11px] text-red-600 mt-1">{photoError}</p>}
      </div>
    </div>
  );
}
