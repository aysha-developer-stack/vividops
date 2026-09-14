export function hideJobFileConfirm(fileName: string): string {
  return `Remove "${fileName}" from this job?\n\nThe file is hidden, not permanently erased. An admin can restore it from Deleted files.`;
}
