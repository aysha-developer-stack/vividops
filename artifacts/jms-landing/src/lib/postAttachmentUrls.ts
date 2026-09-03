import { imagePreviewSrc } from "@/lib/attachmentPreview";

export function postAttachmentPreviewUrl(postId: string, attachmentId: string): string {
  return `/api/posts/${postId}/attachments/${attachmentId}/view?disposition=inline`;
}

export function postAttachmentDownloadUrl(postId: string, attachmentId: string): string {
  return `/api/posts/${postId}/attachments/${attachmentId}/view?disposition=attachment`;
}

type TrainingAttachmentLike = {
  id?: string;
  url: string;
  fileName: string;
  mimeType?: string | null;
};

export function trainingAttachmentPreviewUrl(postId: string, attachment: TrainingAttachmentLike): string {
  if (attachment.id) return postAttachmentPreviewUrl(postId, attachment.id);
  return imagePreviewSrc(attachment.url, attachment.fileName, attachment.mimeType);
}

export function trainingAttachmentDownloadUrl(postId: string, attachment: TrainingAttachmentLike): string {
  if (attachment.id) return postAttachmentDownloadUrl(postId, attachment.id);
  return attachment.url;
}
