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
  if (lower === "arch" || lower === "architectural plan" || lower.startsWith("arch ")) {
    return "Architecture";
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

export function computeCliqChannelName(job: CliqChannelJobInput): string {
  const number = extractCliqJobNumber(job);
  const title = cliqChannelJobTitle(job.title || "Job");
  const address = cleanSpaces(job.address || "");

  const prefix = `${number}-${title}`;
  return fitCliqChannelName(prefix, address, CLIQ_CHANNEL_NAME_MAX);
}

export function buildFallbackCliqChannelName(
  job: CliqChannelJobInput | undefined,
  jobId: string,
): string {
  if (job) {
    return computeCliqChannelName({
      jobNumber: (job as { jobNumber?: string | null }).jobNumber,
      number: job.number,
      title: job.title,
      address: job.address ?? undefined,
    });
  }
  return computeCliqChannelName({ serial: 0, title: "Job", number: jobId.slice(0, 8) });
}

export function buildCliqChannelDisplayName(
  job: CliqChannelJobInput | undefined,
  channelName: string,
): string {
  if (job?.title || job?.address || job?.number) {
    return computeCliqChannelName(job);
  }
  return channelName;
}
