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
import { normalizeMirroredCliqText } from "./cliq-history-parse";
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
  const rows = await db.execute(sql`
    SELECT job_message_id
    FROM job_message_sync
    WHERE source = 'zoho_cliq'
      AND external_message_id = ${externalMessageId}
    LIMIT 1
  `);
  const row = ((rows as { rows?: Array<{ job_message_id?: string }> }).rows ?? [])[0];
  return row?.job_message_id ?? null;
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

  const externalMessageId = input.externalMessageId?.trim() || null;
  if (externalMessageId) {
    const existingId = await existingByExternalId(externalMessageId);
    if (existingId) {
      return { id: existingId, text: cleanText, createdAt: new Date().toISOString(), duplicate: true };
    }
  }

  const mirroredExisting = await existingByExactText(input.job.id, cleanText);
  if (mirroredExisting && (normalized.wasMirrored || !externalMessageId)) {
    return { id: mirroredExisting, text: cleanText, createdAt: new Date().toISOString(), duplicate: true };
  }

  const { actor, usedSyncUser, displayName } = await resolveCliqMessageActor(
    input.senderEmail,
    input.senderName,
  );

  const msgId = randomUUID();
  const createdAt = input.createdAt && !Number.isNaN(input.createdAt.getTime())
    ? input.createdAt
    : new Date();

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
