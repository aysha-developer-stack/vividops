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

export function extractCliqJobNumber(job: CliqChannelJobInput): string {
  const fromNumberField = job.number?.replace(/^JOB-/i, "").trim();
  const raw =
    job.jobNumber?.trim() ||
    fromNumberField ||
    (job.serial != null ? String(job.serial) : "");
  const normalized = raw.replace(/^job[\s-]*/i, "").trim();
  return normalized || (job.serial != null ? String(job.serial) : "0");
}

/** Human-readable Cliq channel name: `12-Structural Inspection - 19 STEVENS STREET` (Cliq UI adds `#`). */
export function computeCliqChannelName(job: CliqChannelJobInput): string {
  const number = extractCliqJobNumber(job);
  const title = cleanSpaces(job.title || "Job");
  const address = cleanSpaces(job.address || "");

  let name = `${number}-${title}`;
  if (address) {
    name += ` - ${address}`;
  }

  if (name.length <= CLIQ_CHANNEL_NAME_MAX) {
    return name;
  }

  const prefix = `${number}-${title}`;
  if (prefix.length >= CLIQ_CHANNEL_NAME_MAX) {
    return prefix.slice(0, CLIQ_CHANNEL_NAME_MAX);
  }
  if (!address) {
    return prefix.slice(0, CLIQ_CHANNEL_NAME_MAX);
  }

  const suffix = ` - ${address}`;
  return (prefix + suffix).slice(0, CLIQ_CHANNEL_NAME_MAX);
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
