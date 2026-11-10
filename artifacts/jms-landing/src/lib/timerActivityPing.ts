export function remainingDeadlineSeconds(deadlineMs: number | null, nowMs = Date.now()): number {
  if (deadlineMs == null) return 0;
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}

export function isDocumentVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}
