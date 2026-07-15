export const MISTAKE_CATEGORIES = [
  "wrong_data_entry",
  "wrong_measurement",
  "missing_file",
  "incorrect_file_upload",
  "checklist_incomplete",
  "missed_deadline",
  "communication_issue",
  "safety_procedure_not_followed",
  "client_requirement_missed",
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
  wrong_data_entry: "Wrong Data Entry",
  wrong_measurement: "Wrong Measurement",
  missing_file: "Missing File",
  incorrect_file_upload: "Incorrect File Upload",
  checklist_incomplete: "Checklist Incomplete",
  missed_deadline: "Missed Deadline",
  communication_issue: "Communication Issue",
  safety_procedure_not_followed: "Safety Procedure Not Followed",
  client_requirement_missed: "Client Requirement Missed",
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
