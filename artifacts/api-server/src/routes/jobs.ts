import { Router, type IRouter } from "express";
import { and, eq, or, desc, inArray, sql as dsql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, jobs, users, jobMembers, type JobRow, type UserRow, sql } from "@workspace/db";
import { createNotification } from "../lib/notifications";
import { randomUUID } from "node:crypto";
import { CreateJobBody, UpdateJobBody } from "@workspace/api-zod";
import { publicJob } from "../lib/serialize";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { getZohoCliqAccessToken } from "../lib/zoho";
import { ensureLegacySupervisorAssignments } from "../lib/schema-init";

import { shouldSendNotification } from "../lib/notifications";

const router: IRouter = Router();

const assigneeAlias = alias(users, "assignee");
const supervisorAlias = alias(users, "supervisor");

const ensureJobMembersSchema = async () => {};
const ensureJobMessagesSchema = async () => {};
const ensureJobMessageSyncSchema = async () => {};
const ensureNotificationsSchema = async () => {};
const ensureJobCliqSchema = async () => {};

type JobWithRefs = {
  job: JobRow;
  assignee: Pick<UserRow, "id" | "name" | "role"> | null;
  supervisor: Pick<UserRow, "id" | "name" | "role"> | null;
};

function rowToPublic({ job, assignee, supervisor }: JobWithRefs) {
  return publicJob(job, assignee ?? undefined, supervisor ?? undefined);
}

function selectJoined() {
  return db
    .select({
      job: jobs,
      assignee: {
        id: assigneeAlias.id,
        name: assigneeAlias.name,
        role: assigneeAlias.role,
        // Notify Admin on reassignment
      const admins = await db.select({ id: users.id }).from(users).where(inArray(users.role, ["admin", "super-admin"]));
      for (const admin of admins) {
        await createNotification(
          admin.id,
          `Job Reassigned: ${after.job.title}`,
          `Assignee changed from ${full.assignee?.name ?? "None"} to ${after.assignee?.name ?? "None"}`,
          "updated"
        );
      }
    },
      supervisor: {
        id: supervisorAlias.id,
        name: supervisorAlias.name,
        role: supervisorAlias.role,
      },
    })
    .from(jobs)
    .leftJoin(assigneeAlias, eq(assigneeAlias.id, jobs.assigneeId))
    .leftJoin(supervisorAlias, eq(supervisorAlias.id, jobs.supervisorId));
}

async function loadJob(id: string): Promise<JobWithRefs | null> {
  const [row] = await selectJoined().where(eq(jobs.id, id)).limit(1);
  if (!row) return null;
  // Drizzle returns nulled-out objects for left joins; normalize to null.
  return {
    job: row.job,
    assignee: row.assignee?.id ? row.assignee : null,
    supervisor: row.supervisor?.id ? row.supervisor : null,
  };
}

async function isAdditionalJobMember(jobId: string, userId: string): Promise<boolean> {
  await ensureJobMembersSchema();
  const [row] = await db
    .select({ id: jobMembers.id })
    .from(jobMembers)
    .where(and(eq(jobMembers.jobId, jobId), eq(jobMembers.userId, userId)))
    .limit(1);
  return !!row;
}

/**
 * Returns true if actor may view a job. Admins/super-admins see all.
 * Supervisors only see jobs explicitly assigned to them. Users see jobs assigned
 * to them directly or as additional workers.
 */
async function canViewJob(actor: UserRow, job: JobRow): Promise<boolean> {
  if (actor.role === "super-admin" || actor.role === "admin") return true;
  if (actor.role === "supervisor") {
    return job.supervisorId === actor.id;
  }
  if (job.assigneeId === actor.id) return true;
  return isAdditionalJobMember(job.id, actor.id);
}

async function canViewJobCommunication(actor: UserRow, job: JobRow): Promise<boolean> {
  if (actor.role === "super-admin" || actor.role === "admin") {
    return true;
  }
  if (actor.role === "supervisor") {
    return job.supervisorId === actor.id;
  }
  if (job.assigneeId === actor.id) return true;
  return isAdditionalJobMember(job.id, actor.id);
}

/**
 * Mutation rules:
 *  - super-admin / admin: full edit on any job
 *  - supervisor: edit only jobs they supervise
 *  - user (assignee): may only update progress + status (handled separately)
 */
function canManageJob(actor: UserRow, job: JobRow): boolean {
  if (actor.role === "super-admin" || actor.role === "admin") return true;
  if (actor.role === "supervisor") {
    return job.supervisorId === actor.id;
  }
  return false;
}

function slugifyChannel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function computeCliqChannelName(job: JobRow): string {
  const num = `job-${job.serial}`;
  const title = slugifyChannel(job.title || "job");
  return `${num}-${title}`.slice(0, 80);
}

function cliqWebRoot(): string {
  const explicit = process.env.ZOHO_CLIQ_WEB_ROOT;
  if (explicit && explicit.trim()) return explicit.trim().replace(/\/+$/, "");
  const api = process.env.ZOHO_CLIQ_API_ROOT || "https://cliq.zoho.com/api/v2";
  const normalized = api.trim().replace(/\/+$/, "");
  if (normalized.endsWith("/api/v2")) return normalized.slice(0, -"/api/v2".length);
  return "https://cliq.zoho.com";
}

function computeCliqChannelUrl(channelName: string): string | null {
  if (!channelName) return null;
  return `${cliqWebRoot()}/channels/${channelName}`;
}

async function getOrCreateJobCliqChannel(job: JobRow): Promise<{
  channelName: string;
  channelId: string | null;
  channelUrl: string | null;
  status: string;
  lastError: string | null;
}> {
  await ensureJobCliqSchema();
  const rows = await db.execute(sql`
    SELECT channel_name, channel_id, channel_url, status, last_error
    FROM job_cliq_channels
    WHERE job_id = ${job.id}
    LIMIT 1
  `);
  const existing = (rows as any).rows?.[0] as
    | { channel_name: string; channel_id: string | null; channel_url: string | null; status: string; last_error: string | null }
    | undefined;
  if (existing?.channel_name) {
    const normalizedUrl = computeCliqChannelUrl(existing.channel_name);
    if ((existing.channel_url ?? null) !== normalizedUrl) {
      await db.execute(sql`
        UPDATE job_cliq_channels
        SET channel_url = ${normalizedUrl},
            updated_at = now()
        WHERE job_id = ${job.id}
      `);
    }
    return {
      channelName: existing.channel_name,
      channelId: existing.channel_id ?? null,
      channelUrl: normalizedUrl,
      status: existing.status,
      lastError: existing.last_error ?? null,
    };
  }

  const channelName = computeCliqChannelName(job);
  const channelUrl = computeCliqChannelUrl(channelName);
  await db.execute(sql`
    INSERT INTO job_cliq_channels (job_id, channel_name, channel_url, status)
    VALUES (${job.id}, ${channelName}, ${channelUrl}, 'pending')
    ON CONFLICT (job_id) DO UPDATE
      SET channel_name = EXCLUDED.channel_name,
          channel_url = EXCLUDED.channel_url,
          updated_at = now()
  `);

  return { channelName, channelId: null, channelUrl, status: "pending", lastError: null };
}

function cliqApiRoot(): string {
  return (process.env.ZOHO_CLIQ_API_ROOT || "https://cliq.zoho.com/api/v2").replace(/\/+$/, "");
}

async function postCliqMessageToChannelByName(channelName: string, text: string): Promise<void> {
  const token = await getZohoCliqAccessToken();
  const url = `${cliqApiRoot()}/channelsbyname/${encodeURIComponent(channelName)}/message`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Cliq channel message failed (${res.status}): ${body}`);
  }
}

async function resolveCliqChannelIdByName(token: string, channelName: string): Promise<string | null> {
  const url = `${cliqApiRoot()}/channels?name=${encodeURIComponent(channelName)}&limit=1`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as any;
  const list =
    (Array.isArray(json?.channels) ? json.channels : null) ??
    (Array.isArray(json?.data) ? json.data : null) ??
    (Array.isArray(json) ? json : null) ??
    [];
  for (const item of list) {
    const id =
      (typeof item?.channel_id === "string" && item.channel_id.trim()) ? item.channel_id.trim()
      : (typeof item?.channelId === "string" && item.channelId.trim()) ? item.channelId.trim()
      : null;
    if (id) return id;
  }
  return null;
}

async function postCliqMessageViaWebhook(text: string): Promise<void> {
  const webhookUrl = process.env.ZOHO_CLIQ_WEBHOOK_URL;
  if (!webhookUrl) throw new Error("ZOHO_CLIQ_WEBHOOK_URL is not set");
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Cliq webhook failed (${res.status}): ${body}`);
  }
}

async function listJobParticipantIds(job: JobRow): Promise<string[]> {
  const ids = new Set<string>();
  if (job.assigneeId) ids.add(job.assigneeId);
  if (job.supervisorId) ids.add(job.supervisorId);
  if (job.createdById) ids.add(job.createdById);

  await ensureJobMembersSchema();
  const memberRows = await db
    .select({ userId: jobMembers.userId })
    .from(jobMembers)
    .where(eq(jobMembers.jobId, job.id));
  for (const m of memberRows) ids.add(m.userId);

  const admins = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.role, ["super-admin", "admin"] as any));
  for (const a of admins) ids.add(a.id);

  return Array.from(ids);
}

async function findJobByCliqChannelName(channelName: string): Promise<JobWithRefs | null> {
  await ensureJobCliqSchema();
  const rows = await db.execute(sql`
    SELECT job_id
    FROM job_cliq_channels
    WHERE lower(channel_name) = lower(${channelName})
    LIMIT 1
  `);
  const row = ((rows as any).rows ?? [])[0] as { job_id?: string } | undefined;
  if (!row?.job_id) return null;
  return loadJob(row.job_id);
}

async function findUserByEmail(email: string): Promise<UserRow | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const [row] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${normalized}`)
    .limit(1);
  return row ?? null;
}

function normalizeMirroredCliqText(job: JobRow, text: string): string {
  const trimmed = text.trim();
  const prefix = `JOB-${job.serial} · ${job.title}`;
  if (!trimmed.startsWith(`${prefix}\n`)) return trimmed;
  const remainder = trimmed.slice(prefix.length + 1).trim();
  const generic = remainder.match(/^[^:\n]{1,120}:\s*([\s\S]+)$/);
  return generic?.[1]?.trim() || remainder;
}

async function findRecentJobMessage(jobId: string, userId: string, text: string): Promise<{
  id: string;
  created_at: string;
} | null> {
  const rows = await db.execute(sql`
    SELECT id, created_at
    FROM job_messages
    WHERE job_id = ${jobId}
      AND user_id = ${userId}
      AND text = ${text}
      AND created_at > now() - interval '2 minutes'
    ORDER BY created_at DESC
    LIMIT 1
  `);
  return (((rows as any).rows ?? [])[0] as { id: string; created_at: string } | undefined) ?? null;
}

type CreateStoredJobMessageOptions = {
  job: JobRow;
  actor: Pick<UserRow, "id" | "name">;
  text: string;
  pushToCliq?: boolean;
  externalSource?: string | null;
  externalMessageId?: string | null;
  senderEmail?: string | null;
  rawPayload?: unknown;
};

async function createStoredJobMessage({
  job,
  actor,
  text,
  pushToCliq = false,
  externalSource = null,
  externalMessageId = null,
  senderEmail = null,
  rawPayload = null,
}: CreateStoredJobMessageOptions): Promise<{
  id: string;
  text: string;
  createdAt: string;
  user: { id: string; name: string };
  duplicate: boolean;
}> {
  const cleanText = text.trim();
  if (!cleanText) throw new Error("text is required");

  await ensureJobMessagesSchema();
  await ensureJobMessageSyncSchema();

  if (externalSource && externalMessageId) {
    const existing = await db.execute(sql`
      SELECT id
      FROM job_message_sync
      WHERE source = ${externalSource}
        AND external_message_id = ${externalMessageId}
      LIMIT 1
    `);
    const existingRow = ((existing as any).rows ?? [])[0] as { id?: string } | undefined;
    if (existingRow?.id) {
      const recent = await findRecentJobMessage(job.id, actor.id, cleanText);
      return {
        id: recent?.id ?? existingRow.id,
        text: cleanText,
        createdAt: recent?.created_at ?? new Date().toISOString(),
        user: { id: actor.id, name: actor.name },
        duplicate: true,
      };
    }
  }

  const msgId = randomUUID();
  const inserted = await db.execute(sql`
    INSERT INTO job_messages (id, job_id, user_id, text)
    VALUES (${msgId}, ${job.id}, ${actor.id}, ${cleanText})
    RETURNING id, created_at
  `);
  const insertedRow = ((inserted as any).rows ?? [])[0] as
    | { id: string; created_at: string }
    | undefined;
  const createdAt = insertedRow?.created_at ?? new Date().toISOString();

  if (externalSource) {
    await db.execute(sql`
      INSERT INTO job_message_sync (id, job_id, source, external_message_id, sender_email, payload)
      VALUES (
        ${randomUUID()},
        ${job.id},
        ${externalSource},
        ${externalMessageId},
        ${senderEmail},
        ${rawPayload == null ? null : JSON.stringify(rawPayload)}
      )
      ON CONFLICT DO NOTHING
    `);
  }

  try {
    await ensureNotificationsSchema();
    const recipients = await listJobParticipantIds(job);
    const title = `New message on JOB-${job.serial}`;
    const description = `${job.title}\n${actor.name}: ${cleanText}`;
    const values = recipients
      .filter((uid) => uid !== actor.id)
      .map((uid) => ({
        id: randomUUID(),
        userId: uid,
        title,
        description,
        type: "job_message",
      }));
    for (const v of values) {
      if (await shouldSendNotification(v.userId, 'push')) {
        await db.execute(sql`
          INSERT INTO notifications (id, user_id, title, description, type, is_read)
          VALUES (${v.id}, ${v.userId}, ${v.title}, ${v.description}, ${v.type}, false)
        `);
      }
    }
  } catch (err) {
    logger.warn({ err, jobId: job.id }, "Failed to create in-app message notifications");
  }

  if (pushToCliq) {
    const prefix = `JOB-${job.serial} · ${job.title}`;
    const payload = `${prefix}\n${actor.name}: ${cleanText}`;
    try {
      const ch = await getOrCreateJobCliqChannel(job);
      await postCliqMessageToChannelByName(ch.channelName, payload);
    } catch (errToken) {
      try {
        await postCliqMessageViaWebhook(payload);
      } catch (errWebhook) {
        logger.warn(
          { err: errWebhook, jobId: job.id },
          "Failed to send message to Zoho Cliq",
        );
      }
      logger.debug({ err: errToken, jobId: job.id }, "Cliq channel API send failed; fell back to webhook");
    }
  }

  return {
    id: msgId,
    text: cleanText,
    createdAt,
    user: { id: actor.id, name: actor.name },
    duplicate: false,
  };
}

function getCliqSyncSecret(): string {
  return (process.env.ZOHO_CLIQ_SYNC_SECRET || "").trim();
}

type IncomingCliqMessage = {
  channelName: string;
  text: string;
  senderEmail: string;
  senderName: string;
  externalMessageId: string | null;
  rawPayload: unknown;
};

function parseIncomingCliqMessage(payload: unknown): IncomingCliqMessage | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, any>;

  const pickString = (...values: unknown[]): string => {
    for (const v of values) {
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };

  const channelName = pickString(
    obj.channelName,
    obj.channel_name,
    obj.channel_unique_name,
    obj.channel?.unique_name,
    obj.channel?.channel_unique_name,
    obj.data?.channel_unique_name,
    obj.data?.channelName,
  );
  const text = pickString(
    obj.text,
    obj.message,
    obj.message_text,
    obj.data?.message,
    obj.data?.text,
    obj.message?.text,
  );
  const senderEmail = pickString(
    obj.senderEmail,
    obj.sender_email,
    obj.email,
    obj.user?.email,
    obj.user?.email_id,
    obj.sender?.email,
    obj.sender?.email_id,
  ).toLowerCase();
  const senderName = pickString(
    obj.senderName,
    obj.sender_name,
    obj.user?.name,
    obj.sender?.name,
    obj.name,
  );
  const externalMessageId = pickString(
    obj.externalMessageId,
    obj.external_message_id,
    obj.messageId,
    obj.message_id,
    obj.data?.message_id,
    obj.message?.id,
    obj.message?.message_id,
  );

  if (!channelName || !text || !senderEmail || !senderName) return null;
  return {
    channelName,
    text,
    senderEmail,
    senderName,
    externalMessageId: externalMessageId || null,
    rawPayload: payload,
  };
}

async function markJobCliqStatus(jobId: string, status: string, lastError: string | null): Promise<void> {
  await ensureJobCliqSchema();
  await db.execute(sql`
    UPDATE job_cliq_channels
    SET status = ${status},
        last_error = ${lastError},
        updated_at = now()
    WHERE job_id = ${jobId}
  `);
}

async function provisionCliqChannelForJob(job: JobRow): Promise<void> {
  const ch = await getOrCreateJobCliqChannel(job);
  const channelName = ch.channelName;
  let token = "";
  try {
    token = await getZohoCliqAccessToken();
  } catch (err) {
    await markJobCliqStatus(
      job.id,
      "manual",
      err instanceof Error ? err.message : String(err),
    );
    return;
  }

  const pickString = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s ? s : null;
  };

  const participantIds = await listJobParticipantIds(job);
  const participantRows = await db
    .select({ email: users.email })
    .from(users)
    .where(inArray(users.id, participantIds));
  const participantEmails = Array.from(
    new Set(
      participantRows
        .map((r) => (typeof r.email === "string" ? r.email.trim() : ""))
        .filter(Boolean),
    ),
  );

  await markJobCliqStatus(job.id, "provisioning", null);

  if (ch.status === "active" && !ch.lastError && ch.channelId) {
    let memberAddError: string | null = null;
    if (participantEmails.length > 0) {
      const addRes = await fetch(`${cliqApiRoot()}/channels/${encodeURIComponent(ch.channelId)}/members`, {
        method: "POST",
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email_ids: participantEmails }),
      });
      if (!addRes.ok) {
        const body = await addRes.text().catch(() => "");
        memberAddError = `Cliq add channel members failed (${addRes.status}): ${body}`;
      }
    }

    await db.execute(sql`
      UPDATE job_cliq_channels
      SET status = 'active',
          last_error = ${memberAddError},
          updated_at = now()
      WHERE job_id = ${job.id}
    `);
    return;
  }

  // First check if channel already exists in Cliq
  let existingChannelId = await resolveCliqChannelIdByName(token, channelName);
  let createdChannelName = channelName;
  let createdChannelUrl = computeCliqChannelUrl(channelName);
  let discoveredChannelId: string | null = existingChannelId;

  // Only create new channel if it doesn't exist yet
  if (!existingChannelId) {
    const rawLevel = (process.env.ZOHO_CLIQ_CHANNEL_LEVEL || "private").trim().toLowerCase();
    const level =
      rawLevel === "organization" || rawLevel === "team" || rawLevel === "private" || rawLevel === "external"
        ? rawLevel
        : "private";

    const createBody: Record<string, unknown> = {
      level,
      name: channelName,
      description: `Job channel for JOB-${job.serial} · ${job.title}`,
    };
    if (level === "private" && participantEmails.length > 0) {
      createBody.email_ids = participantEmails;
    }

    const createRes = await fetch(`${cliqApiRoot()}/channels`, {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createBody),
    });
    if (!createRes.ok) {
      const body = await createRes.text().catch(() => "");
      throw new Error(`Cliq create channel failed (${createRes.status}): ${body}`);
    }

    const createJson = (await createRes.json().catch(() => null)) as any;
    discoveredChannelId =
      pickString(createJson?.data?.channel_id) ??
      pickString(createJson?.data?.channelId) ??
      pickString(createJson?.channel_id) ??
      pickString(createJson?.channelId);
    const discoveredName =
      pickString(createJson?.data?.unique_name) ??
      pickString(createJson?.data?.channel_unique_name) ??
      pickString(createJson?.data?.name) ??
      pickString(createJson?.data?.uniqueName) ??
      pickString(createJson?.unique_name) ??
      pickString(createJson?.name);
    createdChannelName = discoveredName ?? channelName;

    const discoveredUrl =
      pickString(createJson?.data?.permalink) ??
      pickString(createJson?.data?.channel_url) ??
      pickString(createJson?.data?.url) ??
      pickString(createJson?.permalink) ??
      pickString(createJson?.url);
    createdChannelUrl = discoveredUrl ?? computeCliqChannelUrl(createdChannelName);
  }

  await db.execute(sql`
    UPDATE job_cliq_channels
    SET channel_name = ${createdChannelName},
        channel_id = ${discoveredChannelId},
        channel_url = ${createdChannelUrl},
        updated_at = now()
    WHERE job_id = ${job.id}
  `);

  let memberAddError: string | null = null;
  if (participantEmails.length > 0) {
    const channelIdForMembers = discoveredChannelId ?? ch.channelId;
    const addUrl = channelIdForMembers
      ? `${cliqApiRoot()}/channels/${encodeURIComponent(channelIdForMembers)}/members`
      : `${cliqApiRoot()}/channelsbyname/${encodeURIComponent(createdChannelName)}/members`;
    const addRes = await fetch(addUrl, {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email_ids: participantEmails }),
    });
    if (!addRes.ok) {
      const body = await addRes.text().catch(() => "");
      memberAddError = `Cliq add channel members failed (${addRes.status}): ${body}`;
    }
  }

  const channelUrl = createdChannelUrl;
  await db.execute(sql`
    UPDATE job_cliq_channels
    SET channel_url = ${channelUrl},
        status = 'active',
        last_error = ${memberAddError},
        updated_at = now()
    WHERE job_id = ${job.id}
  `);
}

router.get("/jobs", requireAuth, async (req, res) => {
  const actor = req.session!.user;
  const scope = typeof (req.query as any)?.for === "string" ? String((req.query as any).for) : "";
  const forCommunication = scope === "communication";
  const q = selectJoined();
  let rows;
  if (actor.role === "supervisor") {
    await ensureLegacySupervisorAssignments();
  }
  if (actor.role === "super-admin" || actor.role === "admin") {
    rows = await q.orderBy(desc(jobs.createdAt));
  } else if (actor.role === "supervisor") {
    rows = await q.where(eq(jobs.supervisorId, actor.id)).orderBy(desc(jobs.createdAt));
  } else {
    await ensureJobMembersSchema();
    const memberRows = await db
      .select({ jobId: jobMembers.jobId })
      .from(jobMembers)
      .where(eq(jobMembers.userId, actor.id));
    const memberJobIds = memberRows.map((r) => r.jobId);
    if (forCommunication) {
      rows =
        memberJobIds.length === 0
          ? await q.where(eq(jobs.assigneeId, actor.id)).orderBy(desc(jobs.createdAt))
          : await q
              .where(or(eq(jobs.assigneeId, actor.id), inArray(jobs.id, memberJobIds)))
              .orderBy(desc(jobs.createdAt));
    } else {
      rows =
        memberJobIds.length === 0
          ? await q.where(eq(jobs.assigneeId, actor.id)).orderBy(desc(jobs.createdAt))
          : await q
              .where(or(eq(jobs.assigneeId, actor.id), inArray(jobs.id, memberJobIds)))
              .orderBy(desc(jobs.createdAt));
    }
  }
  return res.json(
    rows.map((r: any) =>
      rowToPublic({
        job: r.job,
        assignee: r.assignee?.id ? r.assignee : null,
        supervisor: r.supervisor?.id ? r.supervisor : null,
      }),
    ),
  );
});

const creatorRole = requireRole("super-admin", "admin", "supervisor");

router.post("/jobs", creatorRole, async (req, res) => {
  const parsed = CreateJobBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid job data" });
  }
  const actor = req.session!.user;
  const body = parsed.data;

  // Validate referenced users exist and are active.
  const refIds = [body.assigneeId, body.supervisorId].filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );
  if (refIds.length > 0) {
    const found = await db
      .select({ id: users.id, status: users.status, role: users.role })
      .from(users)
      .where(inArray(users.id, refIds));
    if (found.length !== new Set(refIds).size) {
      return res.status(400).json({ error: "Assignee or supervisor not found" });
    }
    if (found.some((u) => u.status !== "active")) {
      return res
        .status(400)
        .json({ error: "Cannot assign an inactive user" });
    }
    if (
      body.assigneeId &&
      found.some((u) => u.id === body.assigneeId && u.role !== "user")
    ) {
      return res.status(400).json({ error: "Assignee must be a worker" });
    }
    if (
      body.supervisorId &&
      found.some((u) => u.id === body.supervisorId && u.role !== "supervisor")
    ) {
      return res.status(400).json({ error: "Supervisor must have supervisor role" });
    }
  }

  // Supervisors creating jobs become the supervisor by default.
  const supervisorId =
    body.supervisorId ?? (actor.role === "supervisor" ? actor.id : null);

  const [created] = await db
    .insert(jobs)
    .values({
      title: body.title,
      client: body.client,
      address: body.address ?? null,
      description: body.description ?? null,
      priority: body.priority ?? "medium",
      assigneeId: body.assigneeId ?? null,
      supervisorId,
      createdById: actor.id,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
    })
    .returning();

  const full = await loadJob(created.id);
  if (full) {
    // Notify Assignee
    if (full.job.assigneeId) {
      await createNotification(
        full.job.assigneeId,
        `New Job Assigned: ${full.job.title}`,
        `You have been assigned to a new job: ${full.job.title} for ${full.job.client}. Due Date: ${full.job.dueDate ? new Date(full.job.dueDate).toLocaleDateString() : "Not set"}`,
        "assigned"
      );
    }
    // Notify Supervisor
    if (full.job.supervisorId) {
      await createNotification(
        full.job.supervisorId,
        `New Job for Supervision: ${full.job.title}`,
        `A new job has been assigned to your team: ${full.job.title} for ${full.job.client}. Assigned to: ${full.assignee?.name ?? "Unassigned"}`,
        "assigned"
      );
    }

    void getOrCreateJobCliqChannel(full.job).catch((err) => {
      logger.warn({ err, jobId: full.job.id }, "Failed to initialize job Cliq channel metadata");
    });
    void provisionCliqChannelForJob(full.job).catch((err) => {
      void markJobCliqStatus(full.job.id, "failed", err instanceof Error ? err.message : String(err)).catch(() => {});
      logger.warn({ err, jobId: full.job.id }, "Failed to provision Cliq channel");
    });
  }
  return res.status(201).json(rowToPublic(full!));
});

router.get("/jobs/:id", requireAuth, async (req, res) => {
  const id = req.params.id as string;
  const full = await loadJob(id);
  if (!full) return res.status(404).json({ error: "Job not found" });
  if (!(await canViewJob(req.session!.user, full.job))) {
    return res.status(403).json({ error: "You cannot view this job" });
  }
  return res.json(rowToPublic(full));
});

router.patch("/jobs/:id", requireAuth, async (req, res) => {
  const id = req.params.id as string;
  const parsed = UpdateJobBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid update" });
  }
  const actor = req.session!.user;
  const full = await loadJob(id);
  if (!full) return res.status(404).json({ error: "Job not found" });
  const body = parsed.data;

  const isManager = canManageJob(actor, full.job);
  const isAssignee = full.job.assigneeId === actor.id;
  if (!isManager && !isAssignee) {
    return res.status(403).json({ error: "You cannot update this job" });
  }

  // Field-level access control: assignee-only edits are limited to status + progress.
  if (!isManager) {
    const allowed = new Set(["status", "progress"]);
    const offenders = Object.keys(body).filter((k) => !allowed.has(k));
    if (offenders.length > 0) {
      return res.status(403).json({
        error: "Assignees may only update status or progress",
      });
    }
  }

  // Validate referenced users if changing.
  const refIds = [body.assigneeId, body.supervisorId].filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );
  if (refIds.length > 0) {
    const found = await db
      .select({ id: users.id, status: users.status, role: users.role })
      .from(users)
      .where(inArray(users.id, refIds));
    if (found.length !== new Set(refIds).size) {
      return res.status(400).json({ error: "Assignee or supervisor not found" });
    }
    if (found.some((u) => u.status !== "active")) {
      return res
        .status(400)
        .json({ error: "Cannot assign an inactive user" });
    }
    if (
      body.assigneeId &&
      found.some((u) => u.id === body.assigneeId && u.role !== "user")
    ) {
      return res.status(400).json({ error: "Assignee must be a worker" });
    }
    if (
      body.supervisorId &&
      found.some((u) => u.id === body.supervisorId && u.role !== "supervisor")
    ) {
      return res.status(400).json({ error: "Supervisor must have supervisor role" });
    }
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) patch.title = body.title;
  if (body.client !== undefined) patch.client = body.client;
  if (body.address !== undefined) patch.address = body.address;
  if (body.description !== undefined) patch.description = body.description;
  if (body.priority !== undefined) patch.priority = body.priority;
  if (body.status !== undefined) {
    patch.status = body.status;
    if (body.status === "completed") {
      patch.completedAt = new Date();
      patch.progress = 100;
    } else {
      patch.completedAt = null;
    }
  }
  if (body.assigneeId !== undefined) patch.assigneeId = body.assigneeId;
  if (body.supervisorId !== undefined) patch.supervisorId = body.supervisorId;
  if (body.dueDate !== undefined) {
    patch.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  }
  if (body.progress !== undefined) patch.progress = body.progress;

  const oldAssigneeId = full.job.assigneeId;
  const oldSupervisorId = full.job.supervisorId;

  await db.update(jobs).set(patch).where(eq(jobs.id, id));
  const after = await loadJob(id);
  if (after) {
    // Check for reassignment
    if (body.assigneeId !== undefined && body.assigneeId !== oldAssigneeId) {
      if (oldAssigneeId) {
        await createNotification(
          oldAssigneeId,
          `Job Reassigned: ${after.job.title}`,
          `You have been removed from the job: ${after.job.title}.`,
          "updated"
        );
      }
      if (body.assigneeId) {
        await createNotification(
          body.assigneeId,
          `New Job Assigned: ${after.job.title}`,
          `You have been assigned to a new job: ${after.job.title} for ${after.job.client}. Due Date: ${after.job.dueDate ? new Date(after.job.dueDate).toLocaleDateString() : "Not set"}`,
          "assigned"
        );
      }
      // Notify Supervisor and Admin on reassignment
      if (after.job.supervisorId) {
        await createNotification(
          after.job.supervisorId,
          `Job Reassigned: ${after.job.title}`,
          `Assignee changed from ${full.assignee?.name ?? "None"} to ${after.assignee?.name ?? "None"}`,
          "updated"
        );
      }
      const admins = await db.select({ id: users.id }).from(users).where(inArray(users.role, ["admin", "super-admin"]));
      for (const admin of admins) {
        await createNotification(
          admin.id,
          `Job Reassigned: ${after.job.title}`,
          `Assignee changed from ${full.assignee?.name ?? "None"} to ${after.assignee?.name ?? "None"}`,
          "updated"
        );
      }
    }

    // Check for supervisor change
    if (body.supervisorId !== undefined && body.supervisorId !== oldSupervisorId) {
      if (body.supervisorId) {
        await createNotification(
          body.supervisorId,
          `New Job for Supervision: ${after.job.title}`,
          `You are now supervising this job: ${after.job.title}.`,
          "assigned"
        );
      }
    }

    void getOrCreateJobCliqChannel(after.job).catch((err) => {
      logger.warn({ err, jobId: after.job.id }, "Failed to refresh job Cliq channel metadata");
    });
    void provisionCliqChannelForJob(after.job).catch((err) => {
      void markJobCliqStatus(after.job.id, "failed", err instanceof Error ? err.message : String(err)).catch(() => {});
      logger.warn({ err, jobId: after.job.id }, "Failed to provision Cliq channel");
    });
  }
  return res.json(rowToPublic(after!));
});

router.delete("/jobs/:id", creatorRole, async (req, res) => {
  const id = req.params.id as string;
  const actor = req.session!.user;
  const full = await loadJob(id);
  if (!full) return res.status(404).json({ error: "Job not found" });
  if (!canManageJob(actor, full.job)) {
    return res.status(403).json({ error: "You cannot delete this job" });
  }
  await db.delete(jobs).where(eq(jobs.id, id));
  return res.status(204).end();
});

router.post("/zoho/cliq/messages/incoming", async (req, res) => {
  try {
    const configuredSecret = getCliqSyncSecret();
    if (!configuredSecret) {
      return res.status(501).json({ error: "ZOHO_CLIQ_SYNC_SECRET not configured" });
    }

    const suppliedSecret =
      (typeof req.headers["x-cliq-sync-secret"] === "string" ? req.headers["x-cliq-sync-secret"] : "") ||
      (typeof req.query.secret === "string" ? req.query.secret : "") ||
      (typeof req.body?.secret === "string" ? req.body.secret : "");
    if (!suppliedSecret || suppliedSecret !== configuredSecret) {
      return res.status(401).json({ error: "Invalid Cliq sync secret" });
    }

    const message = parseIncomingCliqMessage(req.body);
    if (!message) {
      return res.status(400).json({ error: "Invalid Cliq payload" });
    }

    const full = await findJobByCliqChannelName(message.channelName);
    if (!full) {
      return res.status(404).json({ error: "Job channel not found" });
    }

    const actor = await findUserByEmail(message.senderEmail);
    if (!actor) {
      await markJobCliqStatus(full.job.id, "active", `Cliq sync user not found for ${message.senderEmail}`);
      return res.status(404).json({ error: "Cliq sender not mapped to an app user" });
    }

    if (!(await canViewJobCommunication(actor, full.job))) {
      await markJobCliqStatus(full.job.id, "active", `Cliq sync sender ${message.senderEmail} is not assigned to the job`);
      return res.status(403).json({ error: "Cliq sender is not assigned to this job" });
    }

    const normalizedText = normalizeMirroredCliqText(full.job, message.text);
    const recent = await findRecentJobMessage(full.job.id, actor.id, normalizedText);
    if (recent) {
      return res.json({ ok: true, duplicate: true, id: recent.id });
    }

    const created = await createStoredJobMessage({
      job: full.job,
      actor,
      text: normalizedText,
      pushToCliq: false,
      externalSource: "zoho_cliq",
      externalMessageId: message.externalMessageId,
      senderEmail: message.senderEmail,
      rawPayload: message.rawPayload,
    });

    // Notify participants and handle @mentions
    const mentions = normalizedText.match(/@(\w+)/g);
    const mentionedNames = mentions ? mentions.map(m => m.slice(1).toLowerCase()) : [];
    
    const recipients = new Set<string>();
    if (full.job.assigneeId) recipients.add(full.job.assigneeId);
    if (full.job.supervisorId) recipients.add(full.job.supervisorId);
    
    // Add additional members
    const members = await db.select({ userId: jobMembers.userId }).from(jobMembers).where(eq(jobMembers.jobId, full.job.id));
    for (const m of members) recipients.add(m.userId);

    for (const rid of recipients) {
      if (rid === actor.id) continue;

      // If there are mentions, only notify mentioned users
      if (mentionedNames.length > 0) {
        const [target] = await db.select({ name: users.name }).from(users).where(eq(users.id, rid)).limit(1);
        if (target && mentionedNames.some(name => target.name.toLowerCase().includes(name))) {
          await createNotification(
            rid,
            `Mentioned in ${full.job.title}`,
            `${actor.name} mentioned you in a message for ${full.job.title}: ${normalizedText}`,
            "job_message"
          );
        }
      } else {
        // Normal message notification
        await createNotification(
          rid,
          `New Message: ${full.job.title}`,
          `${actor.name}: ${normalizedText}`,
          "job_message"
        );
      }
    }

    await markJobCliqStatus(full.job.id, "active", null);
    return res.json({ ok: true, duplicate: created.duplicate, id: created.id });
  } catch (err) {
    logger.error({ err }, "Failed to sync incoming Cliq message");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/jobs/:id/messages", requireAuth, async (req, res) => {
  try {
    const id = req.params.id as string;
    const actor = req.session!.user;

    const full = await loadJob(id);
    if (!full) return res.status(404).json({ error: "Job not found" });
    if (!(await canViewJobCommunication(actor, full.job))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await ensureJobMessagesSchema();
    const rows = await db.execute(sql`
      SELECT
        jm.id,
        jm.text,
        jm.created_at,
        u.id AS user_id,
        u.name AS user_name
      FROM job_messages jm
      JOIN users u ON u.id = jm.user_id
      WHERE jm.job_id = ${id}
      ORDER BY jm.created_at ASC
      LIMIT 200
    `);
    const items = ((rows as any).rows ?? []) as Array<{
      id: string;
      text: string;
      created_at: string;
      user_id: string;
      user_name: string;
    }>;

    return res.json(
      items.map((m) => ({
        id: m.id,
        text: m.text,
        createdAt: m.created_at,
        isMe: m.user_id === actor.id,
        user: { id: m.user_id, name: m.user_name },
      })),
    );
  } catch (err) {
    logger.error({ err }, "Failed to list job messages");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/jobs/:id/messages", requireAuth, async (req, res) => {
  try {
    const id = req.params.id as string;
    const actor = req.session!.user;
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    const pushToCliq = req.body?.pushToCliq !== false;
    if (!text) return res.status(400).json({ error: "text is required" });

    const full = await loadJob(id);
    if (!full) return res.status(404).json({ error: "Job not found" });
    if (!(await canViewJobCommunication(actor, full.job))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const created = await createStoredJobMessage({
      job: full.job,
      actor,
      text,
      pushToCliq,
    });

    return res.status(201).json({
      id: created.id,
      text: created.text,
      createdAt: created.createdAt,
      isMe: true,
      user: created.user,
    });
  } catch (err) {
    logger.error({ err }, "Failed to create job message");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/jobs/:id/cliq/channel", requireAuth, async (req, res) => {
  try {
    const id = req.params.id as string;
    const actor = req.session!.user;

    const full = await loadJob(id);
    if (!full) return res.status(404).json({ error: "Job not found" });
    if (!(await canViewJobCommunication(actor, full.job))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const ch = await getOrCreateJobCliqChannel(full.job);
    return res.json(ch);
  } catch (err) {
    logger.error({ err }, "Failed to get job Cliq channel");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/jobs/:id/cliq/join", requireAuth, async (req, res) => {
  try {
    const id = req.params.id as string;
    const actor = req.session!.user;

    const full = await loadJob(id);
    if (!full) return res.status(404).json({ error: "Job not found" });
    if (!(await canViewJobCommunication(actor, full.job))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const email = typeof actor.email === "string" ? actor.email.trim() : "";
    if (!email) return res.status(400).json({ error: "User email is missing" });

    let ch = await getOrCreateJobCliqChannel(full.job);
    if (ch.status !== "active") {
      await provisionCliqChannelForJob(full.job);
      ch = await getOrCreateJobCliqChannel(full.job);
    }

    const token = await getZohoCliqAccessToken();
    let channelId = ch.channelId;
    if (!channelId) {
      channelId = await resolveCliqChannelIdByName(token, ch.channelName);
      if (channelId) {
        await db.execute(sql`
          UPDATE job_cliq_channels
          SET channel_id = ${channelId},
              updated_at = now()
          WHERE job_id = ${full.job.id}
        `);
        ch = await getOrCreateJobCliqChannel(full.job);
      }
    }

    if (!channelId) {
      return res.status(409).json({ error: "Cliq channel not provisioned yet" });
    }

    const addRes = await fetch(`${cliqApiRoot()}/channels/${encodeURIComponent(channelId)}/members`, {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email_ids: [email] }),
    });

    if (!addRes.ok) {
      const body = await addRes.text().catch(() => "");
      await markJobCliqStatus(full.job.id, "active", `Cliq join failed (${addRes.status}): ${body}`);
      return res.status(502).json({ error: "Cliq join failed" });
    }

    await markJobCliqStatus(full.job.id, "active", null);
    ch = await getOrCreateJobCliqChannel(full.job);
    return res.json({ success: true, channelUrl: ch.channelUrl, channelName: ch.channelName });
  } catch (err) {
    logger.error({ err }, "Failed to join job Cliq channel");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/jobs/:id/cliq/provision", requireAuth, async (req, res) => {
  try {
    const id = req.params.id as string;
    const actor = req.session!.user;

    const full = await loadJob(id);
    if (!full) return res.status(404).json({ error: "Job not found" });
    if (!canManageJob(actor, full.job)) {
      return res.status(403).json({ error: "You cannot provision this job" });
    }

    await getOrCreateJobCliqChannel(full.job);
    await provisionCliqChannelForJob(full.job);
    const ch = await getOrCreateJobCliqChannel(full.job);
    return res.json(ch);
  } catch (err) {
    logger.error({ err }, "Failed to provision job Cliq channel");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
