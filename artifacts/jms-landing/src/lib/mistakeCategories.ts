export const MISTAKE_CATEGORIES = [
  "drawing_error",
  "measurement_error",
  "missing_info",
  "calculation_error",
  "quality_issue",
  "deadline_missed",
  "process_not_followed",
  "rework",
  "other",
] as const;

export type MistakeCategory = (typeof MISTAKE_CATEGORIES)[number];

export const MISTAKE_CATEGORY_LABELS: Record<MistakeCategory, string> = {
  drawing_error: "Drawing Error",
  measurement_error: "Measurement Error",
  missing_info: "Missing Information",
  calculation_error: "Calculation Error",
  quality_issue: "Quality Issue",
  deadline_missed: "Deadline Missed",
  process_not_followed: "Process Not Followed",
  rework: "Rework",
  other: "Other",
};

export function formatMistakeCategory(category: string | null | undefined): string {
  if (!category) return "Other";
  if ((MISTAKE_CATEGORIES as readonly string[]).includes(category)) {
    return MISTAKE_CATEGORY_LABELS[category as MistakeCategory];
  }
  return category.replaceAll("_", " ");
}
