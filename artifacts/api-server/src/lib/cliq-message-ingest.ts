import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, jobMembers, type JobRow, sql } from "@workspace/db";
import {
  createNotification,
  notifyJobManagers,
  previewText,
} from "./notifications";
import { ensureJobMessageSyncSchema, ensureAllSchemas } from "./schema-init";
import { resolveCliqMessageActor } from "./cliq-sync-user";
import { formatInboundCliqMessageText } from "./cliq-message-attachments";
import {
  CLIQ_DEDUP_WINDOW_MS,
  cliqDedupeKey,
  cliqExternalIdCandidates,
  cliqSenderDedupeKey,
  isWithinCliqDedupeWindow,
  normalizeMirroredCliqText,
} from "./cliq-history-parse";
import { logger } from "./logger";

export type IngestCliqMessageResult = {
  id: string;
  text: string;
  createdAt: string;
  duplicate: boolean;
};

export type IngestCliqMessageInput = {
  job: JobRow;
  text: string;
  senderEmail: string;
  senderName: string;
  externalMessageId?: string | null;
  externalChannelId?: string | null;
  externalChannelName?: string | null;
  rawPayload?: unknown;
  createdAt?: Date | null;
  notify?: boolean;
  touchJob?: boolean;
};

async function existingByExternalId(externalMessageId: string): Promise<string | null> {
  for (const candidate of cliqExternalIdCandidates(externalMessageId)) {
    const rows = await db.execute(sql`
      SELECT job_message_id
      FROM job_message_sync
      WHERE source = 'zoho_cliq'
        AND external_message_id = ${candidate}
      LIMIT 1
    `);
    const row = ((rows as { rows?: Array<{ job_message_id?: string }> }).rows ?? [])[0];
    if (row?.job_message_id) return row.job_message_id;
  }
  return null;
}

function payloadSenderName(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const name = (payload as { opsSenderName?: unknown }).opsSenderName;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

async function existingRecentCopy(input: {
  jobId: string;
  text: string;
  createdAt: Date;
  senderEmail: string;
  senderName: string;
  rawPayload?: unknown;
}): Promise<string | null> {
  const windowStart = new Date(input.createdAt.getTime() - CLIQ_DEDUP_WINDOW_MS);
  const windowEnd = new Date(input.createdAt.getTime() + CLIQ_DEDUP_WINDOW_MS);
  const incomingKey = cliqDedupeKey(input.text, input.rawPayload);
  const incomingSender = cliqSenderDedupeKey(input.senderEmail, input.senderName);
  const rows = await db.execute(sql`
    SELECT
      jm.id,
      jm.text,
      jm.user_id,
      jm.created_at,
      jms.sender_email,
      jms.payload
    FROM job_messages jm
    LEFT JOIN job_message_sync jms ON jms.job_message_id = jm.id
    WHERE jm.job_id = ${input.jobId}
      AND jm.created_at >= ${windowStart}
      AND jm.created_at <= ${windowEnd}
    ORDER BY jm.created_at ASC
  `);
  const list = ((rows as { rows?: Array<{
    id?: string;
    text?: string;
    user_id?: string;
    created_at?: string;
    sender_email?: string | null;
    payload?: unknown;
  }> }).rows ?? []);

  for (const row of list) {
    if (!row.id || !row.text) continue;
    const existingKey = cliqDedupeKey(row.text, row.payload);
    if (existingKey !== incomingKey) continue;
    const existingSender = cliqSenderDedupeKey(
      row.sender_email,
      payloadSenderName(row.payload),
      row.user_id,
    );
    const sameSender = incomingSender === existingSender;
    const unknownSender = incomingSender === "unknown" || existingSender === "unknown";
    const sameKind = incomingSender.split(":")[0] === existingSender.split(":")[0];
    if (!sameSender && !unknownSender && sameKind) continue;
    const windowMs = sameSender || unknownSender ? CLIQ_DEDUP_WINDOW_MS : 2 * 60 * 1000;
    if (!isWithinCliqDedupeWindow(row.created_at ?? input.createdAt, input.createdAt, windowMs)) continue;
    return row.id;
  }
  return null;
}

async function backfillExternalMessageId(jobMessageId: string, externalMessageId: string): Promise<void> {
  try {
    await db.execute(sql`
      UPDATE job_message_sync
      SET external_message_id = COALESCE(NULLIF(external_message_id, ''), ${externalMessageId}),
          updated_at = now()
      WHERE job_message_id = ${jobMessageId}
        AND (external_message_id IS NULL OR external_message_id = '')
    `);
  } catch (err) {
    logger.warn({ err, jobMessageId, externalMessageId }, "Failed to backfill Cliq message id");
  }
}

async function existingByExactText(jobId: string, text: string): Promise<string | null> {
  const rows = await db.execute(sql`
    SELECT id
    FROM job_messages
    WHERE job_id = ${jobId}
      AND text = ${text}
    ORDER BY created_at ASC
    LIMIT 1
  `);
  const row = ((rows as { rows?: Array<{ id?: string }> }).rows ?? [])[0];
  return row?.id ?? null;
}

export async function ingestInboundCliqMessage(input: IngestCliqMessageInput): Promise<IngestCliqMessageResult> {
  const formatted = formatInboundCliqMessageText(input.text, input.rawPayload);
  const normalized = normalizeMirroredCliqText(input.job, formatted);
  const cleanText = normalized.text;
  if (!cleanText) {
    throw new Error("text is required");
  }

  await ensureAllSchemas();
  await ensureJobMessageSyncSchema();

  const createdAt = input.createdAt && !Number.isNaN(input.createdAt.getTime())
    ? input.createdAt
    : new Date();

  const externalMessageId = input.externalMessageId?.trim() || null;
  if (externalMessageId) {
    const existingId = await existingByExternalId(externalMessageId);
    if (existingId) {
      return { id: existingId, text: cleanText, createdAt: createdAt.toISOString(), duplicate: true };
    }
  }

  const recentExisting = await existingRecentCopy({
    jobId: input.job.id,
    text: cleanText,
    createdAt,
    senderEmail: input.senderEmail,
    senderName: input.senderName,
    rawPayload: input.rawPayload,
  });
  if (recentExisting) {
    if (externalMessageId) await backfillExternalMessageId(recentExisting, externalMessageId);
    return { id: recentExisting, text: cleanText, createdAt: createdAt.toISOString(), duplicate: true };
  }

  const mirroredExisting = await existingByExactText(input.job.id, cleanText);
  if (mirroredExisting && (normalized.wasMirrored || !externalMessageId)) {
    if (externalMessageId) await backfillExternalMessageId(mirroredExisting, externalMessageId);
    return { id: mirroredExisting, text: cleanText, createdAt: createdAt.toISOString(), duplicate: true };
  }

  const { actor, usedSyncUser, displayName } = await resolveCliqMessageActor(
    input.senderEmail,
    input.senderName,
  );

  const msgId = randomUUID();

  try {
    const inserted = await db.execute(sql`
      INSERT INTO job_messages (id, job_id, user_id, text, created_at)
      VALUES (${msgId}, ${input.job.id}, ${actor.id}, ${cleanText}, ${createdAt})
      RETURNING id, created_at
    `);
    const insertedRow = ((inserted as unknown as { rows?: Array<{ id: string; created_at: string }> }).rows ?? [])[0];
    const createdAtIso = insertedRow?.created_at ?? createdAt.toISOString();

    const payload = {
      ...(input.rawPayload && typeof input.rawPayload === "object"
        ? (input.rawPayload as Record<string, unknown>)
        : { raw: input.rawPayload }),
      opsSenderName: displayName,
      opsUsedSyncUser: usedSyncUser,
    };

    await db.execute(sql`
      INSERT INTO job_message_sync (
        id, job_id, job_message_id, source, direction,
        external_message_id, external_channel_id, external_channel_name,
        sender_email, delivery_status, last_error, payload, created_at, updated_at
      )
      VALUES (
        ${randomUUID()},
        ${input.job.id},
        ${msgId},
        'zoho_cliq',
        'inbound',
        ${externalMessageId},
        ${input.externalChannelId ?? null},
        ${input.externalChannelName ?? null},
        ${input.senderEmail.trim().toLowerCase() || null},
        'received',
        null,
        ${JSON.stringify(payload)},
        ${createdAt},
        now()
      )
    `);

    if (input.touchJob !== false) {
      await db.execute(sql`
        UPDATE jobs SET updated_at = now() WHERE id = ${input.job.id}
      `);
    }

    if (input.notify) {
      try {
        const title = `New message on JOB-${input.job.jobNumber?.trim() || input.job.serial}`;
        const description = `${input.job.title} — ${displayName}: ${previewText(cleanText)}`;
        await notifyJobManagers({
          jobId: input.job.id,
          supervisorId: input.job.supervisorId,
          actorId: actor.id,
          title,
          description,
          type: "job_message",
        });
        const workerIds = new Set<string>();
        if (input.job.assigneeId) workerIds.add(input.job.assigneeId);
        const memberRows = await db
          .select({ userId: jobMembers.userId })
          .from(jobMembers)
          .where(eq(jobMembers.jobId, input.job.id));
        for (const m of memberRows) workerIds.add(m.userId);
        workerIds.delete(actor.id);
        if (input.job.supervisorId) workerIds.delete(input.job.supervisorId);
        for (const userId of workerIds) {
          await createNotification({
            userId,
            jobId: input.job.id,
            title,
            description,
            type: "job_message",
          });
        }
      } catch (err) {
        logger.warn({ err, jobId: input.job.id }, "Failed to notify for inbound Cliq message");
      }
    }

    return { id: msgId, text: cleanText, createdAt: createdAtIso, duplicate: false };
  } catch (err) {
    if (externalMessageId) {
      const raced = await existingByExternalId(externalMessageId);
      if (raced) {
        return { id: raced, text: cleanText, createdAt: createdAt.toISOString(), duplicate: true };
      }
    }
    throw err;
  }
}

type StoredCliqMessageRow = {
  id: string;
  text: string;
  user_id: string;
  created_at: string | Date;
  sender_email: string | null;
  payload: unknown;
  external_message_id: string | null;
};

function parseSyncPayload(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Remove webhook+history copies already stored for a job. Keeps the oldest row that has a Cliq message id. */
export async function collapseDuplicateCliqMessages(jobId: string): Promise<number> {
  const rows = await db.execute(sql`
    SELECT
      jm.id,
      jm.text,
      jm.user_id,
      jm.created_at,
      jms.sender_email,
      jms.payload,
      jms.external_message_id
    FROM job_messages jm
    JOIN job_message_sync jms ON jms.job_message_id = jm.id
    WHERE jm.job_id = ${jobId}
      AND jms.source = 'zoho_cliq'
    ORDER BY jm.created_at ASC, jm.id ASC
  `);
  const list = ((rows as { rows?: StoredCliqMessageRow[] }).rows ?? []).map((row) => ({
    ...row,
    payload: parseSyncPayload(row.payload),
  }));

  const keep = new Set<string>();
  const remove: string[] = [];

  for (let i = 0; i < list.length; i += 1) {
    const current = list[i];
    if (!current || keep.has(current.id) || remove.includes(current.id)) continue;
    keep.add(current.id);
    const currentKey = cliqDedupeKey(current.text, current.payload);
    const currentSender = cliqSenderDedupeKey(
      current.sender_email,
      payloadSenderName(current.payload),
      current.user_id,
    );
    for (let j = i + 1; j < list.length; j += 1) {
      const other = list[j];
      if (!other || keep.has(other.id) || remove.includes(other.id)) continue;
      const otherKey = cliqDedupeKey(other.text, other.payload);
      if (otherKey !== currentKey) continue;
      const otherSender = cliqSenderDedupeKey(
        other.sender_email,
        payloadSenderName(other.payload),
        other.user_id,
      );
      const sameSender = currentSender === otherSender;
      const unknownSender = currentSender === "unknown" || otherSender === "unknown";
      const sameKind = currentSender.split(":")[0] === otherSender.split(":")[0];
      if (!sameSender && !unknownSender && sameKind) continue;
      const windowMs = sameSender || unknownSender ? CLIQ_DEDUP_WINDOW_MS : 2 * 60 * 1000;
      if (!isWithinCliqDedupeWindow(current.created_at, other.created_at, windowMs)) continue;
      if (!current.external_message_id && other.external_message_id) {
        await backfillExternalMessageId(current.id, other.external_message_id);
      }
      remove.push(other.id);
    }
  }

  for (const id of remove) {
    await db.execute(sql`DELETE FROM job_messages WHERE id = ${id}`);
  }
  return remove.length;
}
