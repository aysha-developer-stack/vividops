export const APPRECIATION_CATEGORIES = [
  "first_time_right",
  "clean_drawing",
  "fast_turnaround",
  "client_praise",
  "helped_teammate",
  "other",
] as const;

export type AppreciationCategory = (typeof APPRECIATION_CATEGORIES)[number];

export const APPRECIATION_CATEGORY_LABELS: Record<AppreciationCategory, string> = {
  first_time_right: "First-time right",
  clean_drawing: "Clean drawing",
  fast_turnaround: "Fast turnaround",
  client_praise: "Client praise",
  helped_teammate: "Helped a teammate",
  other: "Other",
};

export const APPRECIATION_LEVELS = ["good", "great", "outstanding"] as const;
export type AppreciationLevel = (typeof APPRECIATION_LEVELS)[number];

export const APPRECIATION_LEVEL_LABELS: Record<AppreciationLevel, string> = {
  good: "Good",
  great: "Great",
  outstanding: "Outstanding",
};

export function formatAppreciationCategory(category: string | null | undefined): string {
  if (!category) return "Other";
  if ((APPRECIATION_CATEGORIES as readonly string[]).includes(category)) {
    return APPRECIATION_CATEGORY_LABELS[category as AppreciationCategory];
  }
  return category.replaceAll("_", " ");
}

export function formatAppreciationLevel(level: string | null | undefined): string {
  if (!level) return "Good";
  if ((APPRECIATION_LEVELS as readonly string[]).includes(level)) {
    return APPRECIATION_LEVEL_LABELS[level as AppreciationLevel];
  }
  return level;
}
