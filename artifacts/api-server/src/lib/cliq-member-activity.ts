import { db, sql, type JobRow } from "@workspace/db";
import {
  cliqChannelNameLookupVariants,
  computeCliqChannelName,
} from "./cliq-channel-name";
import { logger } from "./logger";
import { ensureAllSchemas } from "./schema-init";
import { getZohoCliqAccessToken } from "./zoho";

const ensureJobCliqSchema = ensureAllSchemas;

export type CliqMemberActivityKind = "added" | "joined" | "assignee" | "supervisor";

type JobCliqChannelRecord = {
  channelName: string;
  channelId: string | null;
  chatId: string | null;
  status: string;
};

function cliqApiRoot(): string {
  return (process.env.ZOHO_CLIQ_API_ROOT || "https://cliq.zoho.com/api/v2").replace(/\/+$/, "");
}

function getCliqBotUniqueName(): string | null {
  const raw = (process.env.ZOHO_CLIQ_BOT_UNIQUE_NAME || "vividopssync").trim();
  return raw || null;
}

function channelNameCandidates(channelName: string, job: JobRow): string[] {
  return cliqChannelNameLookupVariants(channelName, {
    jobNumber: job.jobNumber,
    serial: job.serial,
    title: job.title,
    address: job.address,
  });
}

export function formatCliqActivityTime(date = new Date()): string {
  const tz = (process.env.TZ || "Australia/Brisbane").trim();
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: tz.includes("/") ? tz : "Australia/Brisbane",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function buildCliqMemberActivityText(
  actorName: string,
  memberName: string,
  kind: CliqMemberActivityKind,
): string {
  const time = formatCliqActivityTime();
  const actor = actorName.trim() || "Someone";
  const member = memberName.trim() || "a member";

  if (kind === "joined") return `${member} joined the channel · ${time}`;
  if (kind === "assignee") return `${actor} set ${member} as assignee · ${time}`;
  if (kind === "supervisor") return `${actor} set ${member} as supervisor · ${time}`;
  return `${actor} added ${member} · ${time}`;
}

async function loadJobCliqChannel(jobId: string): Promise<JobCliqChannelRecord | null> {
  await ensureJobCliqSchema();
  const rows = await db.execute(sql`
    SELECT channel_name, channel_id, chat_id, status
    FROM job_cliq_channels
    WHERE job_id = ${jobId}
    LIMIT 1
  `);
  const row = (rows as { rows?: Array<Record<string, unknown>> }).rows?.[0];
  const channelName = typeof row?.channel_name === "string" ? row.channel_name.trim() : "";
  if (!channelName) return null;
  return {
    channelName,
    channelId: typeof row?.channel_id === "string" ? row.channel_id : null,
    chatId: typeof row?.chat_id === "string" ? row.chat_id : null,
    status: typeof row?.status === "string" ? row.status : "pending",
  };
}

async function resolveChannelId(token: string, channelName: string): Promise<string | null> {
  const url = `${cliqApiRoot()}/channels?name=${encodeURIComponent(channelName)}&limit=1`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const list =
    (Array.isArray(json?.channels) ? json.channels : null) ??
    (Array.isArray(json?.data) ? json.data : null) ??
    [];
  const first = list[0] as Record<string, unknown> | undefined;
  if (!first) return null;
  const id = first.channel_id ?? first.channelId ?? first.id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

async function ensureCliqBotInChannel(channelName: string): Promise<void> {
  const botName = getCliqBotUniqueName();
  if (!botName || !channelName) return;

  const token = await getZohoCliqAccessToken();
  const res = await fetch(`${cliqApiRoot()}/bots/${encodeURIComponent(botName)}/associate`, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel_unique_name: channelName }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.warn(
      { channelName, botName, status: res.status, body },
      "[CLIQ-ACTIVITY] Failed to ensure bot is associated with channel",
    );
  }
}

async function addEmailToChannel(
  token: string,
  channelId: string | null,
  channelName: string,
  email: string,
): Promise<void> {
  const trimmed = email.trim();
  if (!trimmed) return;

  const addUrl = channelId
    ? `${cliqApiRoot()}/channels/${encodeURIComponent(channelId)}/members`
    : `${cliqApiRoot()}/channelsbyname/${encodeURIComponent(channelName)}/members`;
  const res = await fetch(addUrl, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email_ids: [trimmed] }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.warn(
      { channelName, channelId, email: trimmed, status: res.status, body },
      "[CLIQ-ACTIVITY] Failed to add member to Cliq channel",
    );
  }
}

async function postTextToJobChannel(
  channel: JobCliqChannelRecord,
  job: JobRow,
  text: string,
): Promise<void> {
  const token = await getZohoCliqAccessToken();
  const headers = {
    Authorization: `Zoho-oauthtoken ${token}`,
    "Content-Type": "application/json",
  };
  const body = JSON.stringify({ text });
  const botName = getCliqBotUniqueName();
  const nameCandidates = [
    ...new Set([channel.channelName, computeCliqChannelName(job), ...channelNameCandidates(channel.channelName, job)]),
  ].filter(Boolean);

  for (const name of nameCandidates) {
    await ensureCliqBotInChannel(name);
  }

  const attempts: string[] = [];
  if (botName) {
    for (const name of nameCandidates) {
      attempts.push(
        `${cliqApiRoot()}/channelsbyname/${encodeURIComponent(name)}/message?bot_unique_name=${encodeURIComponent(botName)}`,
      );
    }
    if (channel.channelId) {
      attempts.push(
        `${cliqApiRoot()}/channels/${encodeURIComponent(channel.channelId)}/message?bot_unique_name=${encodeURIComponent(botName)}`,
      );
    }
  }
  if (channel.chatId) {
    attempts.push(`${cliqApiRoot()}/chats/${encodeURIComponent(channel.chatId)}/message`);
  }
  if (channel.channelId) {
    attempts.push(`${cliqApiRoot()}/channels/${encodeURIComponent(channel.channelId)}/message`);
  }
  for (const name of nameCandidates) {
    attempts.push(`${cliqApiRoot()}/channelsbyname/${encodeURIComponent(name)}/message`);
  }

  const errors: string[] = [];
  for (const url of attempts) {
    const res = await fetch(url, { method: "POST", headers, body });
    if (res.ok) return;
    const responseBody = await res.text().catch(() => "");
    errors.push(`${url} (${res.status}): ${responseBody}`);
  }

  throw new Error(`Cliq activity message failed: ${errors.join(" | ")}`);
}

/** Post a custom "X added Y · time" line to the job Cliq channel (best-effort). */
export async function announceCliqMemberActivity(options: {
  job: JobRow;
  actorName: string;
  memberName: string;
  memberEmail?: string | null;
  kind: CliqMemberActivityKind;
  /** When false, skip the API member add (e.g. join endpoint already added the user). */
  addToChannel?: boolean;
}): Promise<void> {
  const { job, actorName, memberName, memberEmail, kind, addToChannel = true } = options;

  if (kind === "joined") {
    logger.info({ jobId: job.id }, "[CLIQ-ACTIVITY] Skipping joined-channel bot announcement");
    return;
  }

  try {
    const channel = await loadJobCliqChannel(job.id);
    if (!channel) {
      logger.info({ jobId: job.id }, "[CLIQ-ACTIVITY] No Cliq channel record — skipping announcement");
      return;
    }
    if (channel.status !== "active") {
      logger.info(
        { jobId: job.id, status: channel.status },
        "[CLIQ-ACTIVITY] Cliq channel not active — skipping announcement",
      );
      return;
    }

    const token = await getZohoCliqAccessToken();
    let channelId = channel.channelId;
    if (!channelId) {
      channelId = await resolveChannelId(token, channel.channelName);
    }

    if (addToChannel && memberEmail?.trim()) {
      await addEmailToChannel(token, channelId, channel.channelName, memberEmail);
    }

    const text = buildCliqMemberActivityText(actorName, memberName, kind);
    await postTextToJobChannel({ ...channel, channelId }, job, text);
    logger.info({ jobId: job.id, kind, text }, "[CLIQ-ACTIVITY] Posted member activity message");
  } catch (err) {
    logger.warn({ err, jobId: job.id, kind }, "[CLIQ-ACTIVITY] Failed to announce member activity");
  }
}
