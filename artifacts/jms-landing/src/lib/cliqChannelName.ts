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
