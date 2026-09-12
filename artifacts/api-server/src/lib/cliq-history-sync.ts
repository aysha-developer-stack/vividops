import { db, jobs, type JobRow, sql } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getZohoCliqAccessToken } from "./zoho";
import { ingestInboundCliqMessage } from "./cliq-message-ingest";
import { parseCliqHistoryMessage } from "./cliq-history-parse";
import { logger } from "./logger";

const MIN_SYNC_INTERVAL_MS = 90_000;
const lastAttemptMs = new Map<string, number>();
const inflight = new Set<string>();

function cliqApiRoot(): string {
  return (process.env.ZOHO_CLIQ_API_ROOT || "https://cliq.zoho.com/api/v2").replace(/\/+$/, "");
}

function pickString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

async function fetchChatMembers(
  token: string,
  chatId: string,
): Promise<Map<string, { email: string; name: string }>> {
  const map = new Map<string, { email: string; name: string }>();
  try {
    const res = await fetch(
      `${cliqApiRoot()}/chats/${encodeURIComponent(chatId)}/members?fields=name,email_id,user_id`,
      { headers: { Authorization: `Zoho-oauthtoken ${token}` } },
    );
    if (!res.ok) return map;
    const json = (await res.json()) as { data?: unknown };
    const list = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const id = pickString(row.id, row.user_id, row.userId);
      const email = pickString(row.email, row.email_id, row.emailId).toLowerCase();
      const name = pickString(row.name, row.display_name);
      if (id) map.set(id, { email, name });
    }
  } catch (err) {
    logger.warn({ err, chatId }, "[CLIQ-HISTORY] Failed to load chat members");
  }
  return map;
}

async function fetchChatMessagePage(
  token: string,
  chatId: string,
  totime?: number,
): Promise<unknown[]> {
  const params = new URLSearchParams({ limit: "100" });
  if (totime) params.set("totime", String(totime));
  const res = await fetch(
    `${cliqApiRoot()}/chats/${encodeURIComponent(chatId)}/messages?${params.toString()}`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Cliq history fetch failed (${res.status}): ${body.slice(0, 240)}`);
  }
  const json = (await res.json()) as { data?: unknown };
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json)) return json;
  return [];
}

export type SyncJobCliqHistoryOptions = {
  chatId: string;
  channelId?: string | null;
  channelName?: string | null;
  maxPages?: number;
  force?: boolean;
};

export async function syncJobCliqHistory(
  job: JobRow,
  options: SyncJobCliqHistoryOptions,
): Promise<{ imported: number; skipped: boolean }> {
  const chatId = options.chatId?.trim();
  if (!chatId) return { imported: 0, skipped: true };

  if (!options.force) {
    const last = lastAttemptMs.get(job.id) ?? 0;
    if (Date.now() - last < MIN_SYNC_INTERVAL_MS) {
      return { imported: 0, skipped: true };
    }
  }
  if (inflight.has(job.id)) return { imported: 0, skipped: true };

  inflight.add(job.id);
  lastAttemptMs.set(job.id, Date.now());
  let imported = 0;
  try {
    const token = await getZohoCliqAccessToken();
    const members = await fetchChatMembers(token, chatId);
    const maxPages = Math.max(1, Math.min(options.maxPages ?? 5, 10));
    let totime: number | undefined;
    let oldestMs = Number.POSITIVE_INFINITY;

    for (let page = 0; page < maxPages; page += 1) {
      const rows = await fetchChatMessagePage(token, chatId, totime);
      if (rows.length === 0) break;

      for (const raw of rows) {
        const parsed = parseCliqHistoryMessage(raw);
        if (!parsed) continue;
        const member = parsed.senderId ? members.get(parsed.senderId) : undefined;
        const senderEmail = parsed.senderEmail || member?.email || "";
        const senderName = parsed.senderName || member?.name || "Cliq user";
        const createdMs = parsed.createdAt?.getTime();
        if (createdMs && createdMs < oldestMs) oldestMs = createdMs;

        const result = await ingestInboundCliqMessage({
          job,
          text: parsed.text,
          senderEmail,
          senderName,
          externalMessageId: parsed.externalMessageId,
          externalChannelId: options.channelId ?? chatId,
          externalChannelName: options.channelName ?? null,
          rawPayload: parsed.rawPayload,
          createdAt: parsed.createdAt,
          notify: false,
          touchJob: false,
        });
        if (!result.duplicate) imported += 1;
      }

      if (rows.length < 100 || !Number.isFinite(oldestMs)) break;
      totime = oldestMs - 1;
    }

    await db.execute(sql`
      UPDATE job_cliq_channels
      SET last_history_sync_at = now(),
          last_error = null,
          updated_at = now()
      WHERE job_id = ${job.id}
    `);
    if (imported > 0) {
      logger.info({ jobId: job.id, imported }, "[CLIQ-HISTORY] Imported Cliq channel messages");
    }
    return { imported, skipped: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err, jobId: job.id }, "[CLIQ-HISTORY] Sync failed");
    await db.execute(sql`
      UPDATE job_cliq_channels
      SET last_error = ${message.slice(0, 500)},
          updated_at = now()
      WHERE job_id = ${job.id}
    `).catch(() => undefined);
    return { imported, skipped: false };
  } finally {
    inflight.delete(job.id);
  }
}

export async function syncStaleCliqChannelHistories(limit = 3): Promise<void> {
  const rows = await db.execute(sql`
    SELECT job_id, chat_id, channel_id, channel_name
    FROM job_cliq_channels
    WHERE chat_id IS NOT NULL
      AND chat_id <> ''
      AND (last_history_sync_at IS NULL OR last_history_sync_at < now() - interval '30 minutes')
    ORDER BY last_history_sync_at NULLS FIRST
    LIMIT ${limit}
  `);
  const list = ((rows as unknown as {
    rows?: Array<{ job_id: string; chat_id: string; channel_id: string | null; channel_name: string | null }>;
  }).rows ?? []);

  for (const row of list) {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, row.job_id)).limit(1);
    if (!job) continue;
    await syncJobCliqHistory(job, {
      chatId: row.chat_id,
      channelId: row.channel_id,
      channelName: row.channel_name,
      maxPages: 1,
    });
  }
}
