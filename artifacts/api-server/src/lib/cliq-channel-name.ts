/** Zoho Cliq channel display `name` field max length. */
export const CLIQ_CHANNEL_NAME_MAX = 50;

export type CliqChannelJobInput = {
  jobNumber?: string | null;
  serial?: number | null;
  title?: string | null;
  address?: string | null;
  number?: string | null;
};

function cleanSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Shorter job-type labels for Cliq channel names (50-char limit). Job title in OPS is unchanged. */
export function cliqChannelJobTitle(title: string): string {
  const t = cleanSpaces(title);
  if (!t) return "Job";
  const lower = t.toLowerCase();
  if (lower === "engineering") return "Eng";
  if (
    lower === "arch" ||
    lower === "architecture" ||
    lower === "architectural plan" ||
    lower.startsWith("arch ")
  ) {
    return "Arch";
  }
  return t;
}

function truncateCliqChannelName(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max).trimEnd();
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace >= Math.floor(max * 0.5)) {
    return cut.slice(0, lastSpace).trimEnd();
  }
  return cut;
}

function fitCliqChannelName(prefix: string, address: string, max: number): string {
  if (!address) {
    return truncateCliqChannelName(prefix, max);
  }
  const full = `${prefix} - ${address}`;
  if (full.length <= max) return full;
  if (prefix.length >= max) {
    return truncateCliqChannelName(prefix, max);
  }
  const room = max - prefix.length - 3;
  if (room <= 0) {
    return truncateCliqChannelName(prefix, max);
  }
  return `${prefix} - ${truncateCliqChannelName(address, room)}`;
}

export function extractCliqJobNumber(job: CliqChannelJobInput): string {
  const fromNumberField = job.number?.replace(/^JOB-/i, "").trim();
  const raw =
    job.jobNumber?.trim() ||
    fromNumberField ||
    (job.serial != null ? String(job.serial) : "");
  const normalized = raw.replace(/^job[\s-]*/i, "").trim();
  return normalized || (job.serial != null ? String(job.serial) : "0");
}

/** Human-readable Cliq channel name: `154778-Eng - 39 Forest Court, Helensvale` (Cliq UI adds `#`). */
export function computeCliqChannelName(job: CliqChannelJobInput): string {
  const number = extractCliqJobNumber(job);
  const title = cliqChannelJobTitle(job.title || "Job");
  const address = cleanSpaces(job.address || "");
  const prefix = `${number}-${title}`;
  return fitCliqChannelName(prefix, address, CLIQ_CHANNEL_NAME_MAX);
}

/** Previous slug format for lookup of existing channels. */
export function legacySlugifyCliqChannelName(job: CliqChannelJobInput): string {
  const slugify = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
  const numberSeed = job.jobNumber?.trim() || String(job.serial ?? "");
  const numberPart = `job-${slugify(numberSeed) || job.serial}`;
  const titlePart = slugify(job.title || "job");
  const addressPart = slugify(job.address || "");
  return [numberPart, titlePart, addressPart].filter(Boolean).join("-").slice(0, 80);
}

export function cliqChannelNameLookupVariants(
  channelName: string,
  job: CliqChannelJobInput,
): string[] {
  const names = new Set<string>();
  const add = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (trimmed) names.add(trimmed);
  };

  add(channelName);
  add(computeCliqChannelName(job));
  add(legacySlugifyCliqChannelName(job));
  // Legacy display names before title abbreviations (Eng / Arch).
  const rawTitle = cleanSpaces(job.title || "");
  if (rawTitle) {
    const number = extractCliqJobNumber(job);
    const address = cleanSpaces(job.address || "");
    add(fitCliqChannelName(`${number}-${rawTitle}`, address, CLIQ_CHANNEL_NAME_MAX));
  }

  for (const name of [...names]) {
    add(name.replace(/^#/, ""));
    add(name.replace(/\s+/g, ""));
    add(name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase());
    add(name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, ""));
    if (name.length > 1) add(name.slice(0, -1));
    add(`${name}d`);
  }

  return Array.from(names);
}
