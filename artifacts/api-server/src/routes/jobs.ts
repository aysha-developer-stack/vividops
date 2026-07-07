import { Router, type IRouter } from "express";
import { and, eq, or, desc, inArray, ne, sql as dsql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, jobs, users, jobMembers, type JobRow, type UserRow, sql } from "@workspace/db";
import { createNotification, createNotificationOnce } from "../lib/notifications";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { CreateJobBody, UpdateJobBody } from "@workspace/api-zod";
import { buildJobAssignees, publicJob } from "../lib/serialize";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { getZohoCliqAccessToken } from "../lib/zoho";
import {
  ensureAllSchemas,
  ensureJobMessageSyncSchema,
  ensureJobWriteSchema,
  ensureLegacySupervisorAssignments,
} from "../lib/schema-init";

import { shouldSendNotification } from "../lib/notifications";

const router: IRouter = Router();

const assigneeAlias = alias(users, "assignee");
const supervisorAlias = alias(users, "supervisor");

const ensureJobMembersSchema = ensureJobWriteSchema;
const ensureJobMessagesSchema = ensureAllSchemas;
const ensureNotificationsSchema = ensureAllSchemas;
const ensureJobCliqSchema = ensureAllSchemas;

type JobWithRefs = {
  job: JobRow;
  assignee: Pick<UserRow, "id" | "name" | "role"> | null;
  supervisor: Pick<UserRow, "id" | "name" | "role"> | null;
};

type UserRef = Pick<UserRow, "id" | "name" | "role">;

type MessageSource = "app" | "zoho_cliq";
type MessageDeliveryState = "local_only" | "sent" | "failed" | "received";

async function loadExtraMembersByJobIds(jobIds: string[]): Promise<Map<string, UserRef[]>> {
  const map = new Map<string, UserRef[]>();
  if (jobIds.length === 0) return map;

  await ensureJobMembersSchema();

  const rows = await db
    .select({
      jobId: jobMembers.jobId,
      id: users.id,
      name: users.name,
      role: users.role,
    })
    .from(jobMembers)
    .innerJoin(users, eq(users.id, jobMembers.userId))
    .where(and(inArray(jobMembers.jobId, jobIds), eq(users.role, "user")));

  for (const row of rows) {
    const list = map.get(row.jobId) ?? [];
    list.push({ id: row.id, name: row.name, role: row.role });
    map.set(row.jobId, list);
  }
  return map;
}

function rowToPublic({ job, assignee, supervisor }: JobWithRefs, assignees: UserRef[]) {
  return publicJob(
    job,
    assignee ?? undefined,
    supervisor ?? undefined,
    buildJobAssignees(assignee, assignees),
  );
}

async function toPublicWithAssignees(full: JobWithRefs) {
  try {
    const membersByJob = await loadExtraMembersByJobIds([full.job.id]);
    return rowToPublic(full, membersByJob.get(full.job.id) ?? []);
  } catch (err) {
    logger.warn({ err, jobId: full.job.id }, "Failed to load job assignees");
    return rowToPublic(full, []);
  }
}

function selectJoined() {
  return db
    .select({
      job: jobs,
      assignee: {
        id: assigneeAlias.id,
        name: assigneeAlias.name,
        role: assigneeAlias.role,
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
  const numberSeed = job.jobNumber?.trim() || String(job.serial);
  const numberPart = `job-${slugifyChannel(numberSeed) || job.serial}`;
  const titlePart = slugifyChannel(job.title || "job");
  const addressPart = slugifyChannel(job.address || "");
  return [numberPart, titlePart, addressPart].filter(Boolean).join("-").slice(0, 80);
}

function normalizeJobNumber(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withoutPrefix = trimmed.replace(/^job[\s-]*/i, "");
  const normalized = withoutPrefix.trim().toUpperCase();
  return normalized || null;
}

async function isJobNumberTaken(jobNumber: string, excludeJobId?: string): Promise<boolean> {
  const conditions = [eq(jobs.jobNumber, jobNumber)];
  if (excludeJobId) {
    conditions.push(ne(jobs.id, excludeJobId));
  }
  const [row] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(...conditions))
    .limit(1);
  return Boolean(row);
}

function datesEqual(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.getTime() === b.getTime();
}

async function notifyJobContentUpdated(
  actor: UserRow,
  before: JobRow,
  after: JobRow,
  body: Record<string, unknown>,
) {
  const changed: string[] = [];
  if (body.title !== undefined && body.title !== before.title) changed.push("title");
  if (body.client !== undefined && body.client !== before.client) changed.push("client");
  if (body.address !== undefined && body.address !== before.address) changed.push("address");
  if (body.description !== undefined && body.description !== before.description) {
    changed.push("description");
  }
  if (body.priority !== undefined && body.priority !== before.priority) changed.push("priority");
  if (body.dueDate !== undefined) {
    const nextDue = body.dueDate ? new Date(body.dueDate as string | Date) : null;
    if (!datesEqual(before.dueDate, nextDue)) changed.push("due date");
  }
  if (changed.length === 0) return;

  const recipientIds = new Set<string>();
  if (after.assigneeId) recipientIds.add(after.assigneeId);
  if (after.supervisorId) recipientIds.add(after.supervisorId);
  try {
    const membersByJob = await loadExtraMembersByJobIds([after.id]);
    for (const member of membersByJob.get(after.id) ?? []) {
      if (member.role === "user") recipientIds.add(member.id);
    }
  } catch (err) {
    logger.warn({ err, jobId: after.id }, "Failed to load members for job update notification");
  }
  recipientIds.delete(actor.id);

  const detail =
    changed.includes("description")
      ? "Details, checklist, or scope were updated."
      : `Updated: ${changed.join(", ")}.`;

  for (const userId of recipientIds) {
    await createNotificationOnce(
      {
        userId,
        jobId: after.id,
        title: `Job Updated: ${after.title}`,
        description: `${actor.name} updated ${after.title}. ${detail}`,
        type: "updated",
      },
      new Date(Date.now() - 2 * 60 * 1000),
    );
  }
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
  return `${cliqWebRoot()}/channels/${encodeURIComponent(channelName)}`;
}

function computeCliqChatUrl(chatId: string | null): string | null {
  const value = pickString(chatId);
  if (!value) return null;
  return `${cliqWebRoot()}/app/chats/${encodeURIComponent(value)}`;
}

function pickString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

// #region debug-point A:debug-report-helper
function reportCliqDebug(hypothesisId: string, location: string, msg: string, data: Record<string, unknown>) {
  let url = "http://127.0.0.1:7777/event";
  let sessionId = "cliq-open-link";
  try {
    const envText = readFileSync(".dbg/cliq-open-link.env", "utf8");
    url = envText.match(/DEBUG_SERVER_URL=(.+)/)?.[1]?.trim() || url;
    sessionId = envText.match(/DEBUG_SESSION_ID=(.+)/)?.[1]?.trim() || sessionId;
  } catch {}
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      runId: "pre-fix",
      hypothesisId,
      location,
      msg,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {});
}
// #endregion

type CliqChannelLookup = {
  channelId: string | null;
  channelName: string | null;
  channelUrl: string | null;
  chatId: string | null;
};

function parseCliqChannelLookup(raw: any): CliqChannelLookup | null {
  const item =
    (raw && typeof raw === "object" && raw.data && typeof raw.data === "object") ? raw.data
    : raw;
  if (!item || typeof item !== "object") return null;
  const channelId =
    pickString(item.channel_id) ??
    pickString(item.channelId) ??
    pickString(item.id);
  const channelName =
    pickString(item.unique_name) ??
    pickString(item.channel_unique_name) ??
    pickString(item.uniqueName) ??
    pickString(item.name);
  const chatId =
    pickString(item.chat_id) ??
    pickString(item.chatId);
  const channelUrl =
    pickString(item.permalink) ??
    computeCliqChannelUrl(channelName ?? "") ??
    computeCliqChatUrl(chatId) ??
    pickString(item.channel_url) ??
    pickString(item.url);
  if (!channelId && !channelName && !channelUrl && !chatId) return null;
  return { channelId, channelName, channelUrl, chatId };
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
    const expectedName = computeCliqChannelName(job);
    let finalName = existing.channel_name;
    let finalId = existing.channel_id ?? null;
    let finalUrl = computeCliqChannelUrl(finalName);

    try {
      const token = await getZohoCliqAccessToken();
      const resolved =
        finalId
          ? await resolveCliqChannelById(token, finalId)
          : await resolveCliqChannelByName(token, expectedName) ?? await resolveCliqChannelByName(token, existing.channel_name);
      // #region debug-point A:existing-channel-resolution
      reportCliqDebug("A", "jobs.ts:getOrCreateJobCliqChannel", "[DEBUG] Existing Cliq channel resolution", {
        jobId: job.id,
        serial: job.serial,
        title: job.title,
        storedChannelName: existing.channel_name,
        storedChannelId: existing.channel_id,
        storedChannelUrl: existing.channel_url,
        expectedChannelName: expectedName,
        resolvedChannelId: resolved?.channelId ?? null,
        resolvedChannelName: resolved?.channelName ?? null,
        resolvedChannelUrl: resolved?.channelUrl ?? null,
        resolvedChatId: resolved?.chatId ?? null,
      });
      // #endregion
      if (resolved) {
        finalId = resolved.channelId ?? finalId;
        finalName = resolved.channelName ?? finalName;
        finalUrl = resolved.channelUrl ?? computeCliqChannelUrl(finalName);
      } else if (!finalId) {
        finalName = expectedName;
        finalUrl = computeCliqChannelUrl(finalName);
      }
    } catch {
      if (!finalId && existing.channel_name !== expectedName) {
        finalName = expectedName;
        finalUrl = computeCliqChannelUrl(finalName);
      }
    }

    if (
      existing.channel_name !== finalName ||
      (existing.channel_id ?? null) !== finalId ||
      (existing.channel_url ?? null) !== finalUrl
    ) {
      await db.execute(sql`
        UPDATE job_cliq_channels
        SET channel_name = ${finalName},
            channel_id = ${finalId},
            channel_url = ${finalUrl},
            updated_at = now()
        WHERE job_id = ${job.id}
      `);

      return {
        channelName: finalName,
        channelId: finalId,
        channelUrl: finalUrl,
        status: existing.status,
        lastError: existing.last_error ?? null,
      };
    }

    return {
      channelName: finalName,
      channelId: finalId,
      channelUrl: finalUrl,
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

function parseCliqPostedMessageId(json: unknown): string | null {
  const data = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  const nested =
    data?.data && typeof data.data === "object" ? (data.data as Record<string, unknown>) : null;
  return (
    pickString(nested?.message_id) ??
    pickString(nested?.id) ??
    pickString(data?.message_id) ??
    pickString(data?.id) ??
    null
  );
}

async function postCliqMessageToChannel(
  channelName: string,
  channelId: string | null,
  text: string,
): Promise<string | null> {
  const token = await getZohoCliqAccessToken();
  const headers = {
    Authorization: `Zoho-oauthtoken ${token}`,
    "Content-Type": "application/json",
  };
  const body = JSON.stringify({ text });

  if (channelId) {
    const byIdUrl = `${cliqApiRoot()}/channels/${encodeURIComponent(channelId)}/message`;
    const byIdRes = await fetch(byIdUrl, { method: "POST", headers, body });
    if (byIdRes.ok) {
      return parseCliqPostedMessageId(await byIdRes.json().catch(() => null));
    }
    const byIdBody = await byIdRes.text().catch(() => "");
    logger.warn(
      { channelId, channelName, status: byIdRes.status, body: byIdBody },
      "[CLIQ-PUSH] Channel ID message post failed, trying channel name",
    );
  }

  const byNameUrl = `${cliqApiRoot()}/channelsbyname/${encodeURIComponent(channelName)}/message`;
  const byNameRes = await fetch(byNameUrl, { method: "POST", headers, body });
  if (!byNameRes.ok) {
    const byNameBody = await byNameRes.text().catch(() => "");
    throw new Error(`Cliq channel message failed (${byNameRes.status}): ${byNameBody}`);
  }
  return parseCliqPostedMessageId(await byNameRes.json().catch(() => null));
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
    const resolved = parseCliqChannelLookup(item);
    if (resolved?.channelId) return resolved.channelId;
  }
  return null;
}

async function resolveCliqChannelByName(token: string, channelName: string): Promise<CliqChannelLookup | null> {
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
    const resolved = parseCliqChannelLookup(item);
    if (resolved) return resolved;
  }
  return null;
}

async function resolveCliqChannelById(token: string, channelId: string): Promise<CliqChannelLookup | null> {
  const url = `${cliqApiRoot()}/channels/${encodeURIComponent(channelId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as any;
  return parseCliqChannelLookup(json);
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

async function findJobByCliqChannel(channelId: string | null, channelName: string): Promise<JobWithRefs | null> {
  await ensureJobCliqSchema();
  const rows = channelId
    ? await db.execute(sql`
        SELECT job_id
        FROM job_cliq_channels
        WHERE channel_id = ${channelId}
           OR lower(channel_name) = lower(${channelName})
        LIMIT 1
      `)
    : await db.execute(sql`
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

type UpsertJobMessageSyncOptions = {
  jobId: string;
  jobMessageId: string;
  source: MessageSource;
  direction: "inbound" | "outbound";
  externalMessageId?: string | null;
  externalChannelId?: string | null;
  externalChannelName?: string | null;
  senderEmail?: string | null;
  payload?: unknown;
  deliveryStatus: MessageDeliveryState;
  lastError?: string | null;
};

async function upsertJobMessageSync({
  jobId,
  jobMessageId,
  source,
  direction,
  externalMessageId = null,
  externalChannelId = null,
  externalChannelName = null,
  senderEmail = null,
  payload = null,
  deliveryStatus,
  lastError = null,
}: UpsertJobMessageSyncOptions): Promise<void> {
  await ensureJobMessageSyncSchema();
  await db.execute(sql`
    INSERT INTO job_message_sync (
      id,
      job_id,
      job_message_id,
      source,
      direction,
      external_message_id,
      external_channel_id,
      external_channel_name,
      sender_email,
      delivery_status,
      last_error,
      payload,
      created_at,
      updated_at
    )
    VALUES (
      ${randomUUID()},
      ${jobId},
      ${jobMessageId},
      ${source},
      ${direction},
      ${externalMessageId},
      ${externalChannelId},
      ${externalChannelName},
      ${senderEmail},
      ${deliveryStatus},
      ${lastError},
      ${payload == null ? null : JSON.stringify(payload)},
      now(),
      now()
    )
    ON CONFLICT (job_message_id) DO UPDATE
    SET source = EXCLUDED.source,
        direction = EXCLUDED.direction,
        external_message_id = EXCLUDED.external_message_id,
        external_channel_id = EXCLUDED.external_channel_id,
        external_channel_name = EXCLUDED.external_channel_name,
        sender_email = EXCLUDED.sender_email,
        delivery_status = EXCLUDED.delivery_status,
        last_error = EXCLUDED.last_error,
        payload = EXCLUDED.payload,
        updated_at = now()
  `);
}

type CreateStoredJobMessageOptions = {
  job: JobRow;
  actor: Pick<UserRow, "id" | "name">;
  text: string;
  pushToCliq?: boolean;
  externalSource?: MessageSource | null;
  externalMessageId?: string | null;
  externalChannelId?: string | null;
  externalChannelName?: string | null;
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
  externalChannelId = null,
  externalChannelName = null,
  senderEmail = null,
  rawPayload = null,
}: CreateStoredJobMessageOptions): Promise<{
  id: string;
  text: string;
  createdAt: string;
  user: { id: string; name: string };
  duplicate: boolean;
  source: MessageSource;
  deliveryState: MessageDeliveryState;
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
        source: externalSource,
        deliveryState: "received",
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

  const source: MessageSource = externalSource ?? "app";
  const initialDeliveryState: MessageDeliveryState = externalSource ? "received" : "local_only";
  await upsertJobMessageSync({
    jobId: job.id,
    jobMessageId: msgId,
    source,
    direction: externalSource ? "inbound" : "outbound",
    externalMessageId,
    externalChannelId,
    externalChannelName,
    senderEmail,
    payload: rawPayload,
    deliveryStatus: initialDeliveryState,
  });

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

  logger.debug({ pushToCliq }, "[CLIQ-DEBUG] Checking pushToCliq condition"); // <-- ADD THIS LINE

  let deliveryState: MessageDeliveryState = initialDeliveryState;

  if (pushToCliq) {
    const prefix = `JOB-${job.serial} · ${job.title}`;
    const payload = `${prefix}\n${actor.name}: ${cleanText}`;
    logger.info({ jobId: job.id, channelName: computeCliqChannelName(job) }, "[CLIQ-PUSH] Attempting to push message to Zoho Cliq");
    try {
      const ch = await getOrCreateJobCliqChannel(job);
      if (ch.status !== "active") {
        logger.info({ jobId: job.id, status: ch.status }, "[CLIQ-PUSH] Channel not active, provisioning first");
        await provisionCliqChannelForJob(job);
      }
      const externalId = await postCliqMessageToChannel(ch.channelName, ch.channelId, payload);
      await upsertJobMessageSync({
        jobId: job.id,
        jobMessageId: msgId,
        source: "app",
        direction: "outbound",
        externalMessageId: externalId,
        externalChannelId: ch.channelId,
        externalChannelName: ch.channelName,
        senderEmail: null,
        payload: { text: payload },
        deliveryStatus: "sent",
      });
      deliveryState = "sent";
      logger.info({ jobId: job.id, channel: ch.channelName }, "[CLIQ-PUSH] Successfully pushed message via API");
    } catch (errToken) {
      logger.warn({ err: errToken instanceof Error ? errToken.message : String(errToken), jobId: job.id }, "[CLIQ-PUSH] API push failed, falling back to webhook");
      try {
        await postCliqMessageViaWebhook(payload);
        await upsertJobMessageSync({
          jobId: job.id,
          jobMessageId: msgId,
          source: "app",
          direction: "outbound",
          externalChannelName: computeCliqChannelName(job),
          senderEmail: null,
          payload: { text: payload, via: "webhook_fallback" },
          deliveryStatus: "sent",
        });
        deliveryState = "sent";
        logger.info({ jobId: job.id }, "[CLIQ-PUSH] Successfully pushed message via Webhook fallback");
      } catch (errWebhook) {
        await upsertJobMessageSync({
          jobId: job.id,
          jobMessageId: msgId,
          source: "app",
          direction: "outbound",
          externalChannelName: computeCliqChannelName(job),
          senderEmail: null,
          payload: { text: payload, via: "webhook_fallback" },
          deliveryStatus: "failed",
          lastError: errWebhook instanceof Error ? errWebhook.message : String(errWebhook),
        });
        deliveryState = "failed";
        logger.error(
          { err: errWebhook instanceof Error ? errWebhook.message : String(errWebhook), jobId: job.id },
          "[CLIQ-PUSH] Failed to send message via both API and Webhook",
        );
      }
    }
  }

  return {
    id: msgId,
    text: cleanText,
    createdAt,
    user: { id: actor.id, name: actor.name },
    duplicate: false,
    source,
    deliveryState,
  };
}

function getCliqSyncSecret(): string {
  return (process.env.ZOHO_CLIQ_SYNC_SECRET || "").trim();
}

type IncomingCliqMessage = {
  channelId: string | null;
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

  const channelId = pickString(
    obj.channelId,
    obj.channel_id,
    obj.channel?.id,
    obj.channel?.channel_id,
    obj.data?.channel_id,
    obj.data?.channelId,
  );
  const channelName = pickString(
    obj.channelName,
    obj.channel_name,
    obj.channel_unique_name,
    obj.channel?.name,
    obj.channel?.unique_name,
    obj.channel?.channel_unique_name,
    obj.data?.channel_unique_name,
    obj.data?.channelName,
    obj.data?.channel_name,
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
    channelId: channelId || null,
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
  let discoveredChatId: string | null = null;

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
    discoveredChatId =
      pickString(createJson?.data?.chat_id) ??
      pickString(createJson?.data?.chatId) ??
      pickString(createJson?.chat_id) ??
      pickString(createJson?.chatId);
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
      computeCliqChannelUrl(discoveredName ?? channelName) ??
      computeCliqChatUrl(discoveredChatId) ??
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
  await ensureJobWriteSchema();
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
  const jobIds = rows.map((r: any) => r.job.id as string);
  let membersByJob = new Map<string, UserRef[]>();
  try {
    membersByJob = await loadExtraMembersByJobIds(jobIds);
  } catch (err) {
    logger.warn({ err }, "Failed to load job members for list");
  }
  return res.json(
    rows.map((r: any) => {
      const assignee = r.assignee?.id ? r.assignee : null;
      const supervisor = r.supervisor?.id ? r.supervisor : null;
      return rowToPublic(
        { job: r.job, assignee, supervisor },
        membersByJob.get(r.job.id) ?? [],
      );
    }),
  );
});

const creatorRole = requireRole("super-admin", "admin", "supervisor");

router.post("/jobs", creatorRole, async (req, res) => {
  try {
    await ensureJobWriteSchema();

    const parsed = CreateJobBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid job data" });
    }
    const actor = req.session!.user;
    const body = parsed.data;
    const jobNumber = normalizeJobNumber(body.jobNumber);

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

    if (jobNumber) {
      try {
        if (await isJobNumberTaken(jobNumber)) {
          return res.status(400).json({ error: "Job number already exists" });
        }
      } catch (err) {
        logger.warn({ err, jobNumber }, "Failed to check job number uniqueness");
      }
    }

    // Supervisors creating jobs become the supervisor by default.
    const supervisorId =
      body.supervisorId ?? (actor.role === "supervisor" ? actor.id : null);

    const insertValues = {
      jobNumber,
      title: body.title,
      client: body.client,
      address: body.address ?? null,
      description: body.description ?? null,
      priority: body.priority ?? "medium",
      assigneeId: body.assigneeId ?? null,
      supervisorId,
      createdById: actor.id,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
    };

    let created: JobRow | undefined;
    try {
      [created] = await db.insert(jobs).values(insertValues).returning();
    } catch (insertErr) {
      const message = insertErr instanceof Error ? insertErr.message : String(insertErr);
      if (jobNumber && /job_number/i.test(message)) {
        logger.warn({ err: insertErr }, "Retrying job insert without job_number column");
        const { jobNumber: _ignored, ...withoutJobNumber } = insertValues;
        [created] = await db.insert(jobs).values(withoutJobNumber).returning();
      } else {
        throw insertErr;
      }
    }

    if (!created) {
      return res.status(500).json({ error: "Failed to create job record" });
    }

    const full = await loadJob(created.id);
    if (!full) {
      return res.status(500).json({ error: "Job was created but could not be loaded" });
    }

    // Notify Assignee
    if (full.job.assigneeId) {
      await createNotification({
        userId: full.job.assigneeId,
        jobId: full.job.id,
        title: `New Job Assigned: ${full.job.title}`,
        description: `You have been assigned to a new job: ${full.job.title} for ${full.job.client}. Due Date: ${full.job.dueDate ? new Date(full.job.dueDate).toLocaleDateString() : "Not set"}`,
        type: "assigned"
      });
    }
    // Notify Supervisor
    if (full.job.supervisorId) {
      await createNotification({
        userId: full.job.supervisorId,
        jobId: full.job.id,
        title: `New Job for Supervision: ${full.job.title}`,
        description: `A new job has been assigned to your team: ${full.job.title} for ${full.job.client}. Assigned to: ${full.assignee?.name ?? "Unassigned"}`,
        type: "assigned"
      });
    }

    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.role, ["admin", "super-admin"]));
    for (const admin of admins) {
      if (admin.id === actor.id) continue;
      await createNotification({
        userId: admin.id,
        jobId: full.job.id,
        title: `New Job Created: ${full.job.title}`,
        description: `${full.job.title} for ${full.job.client} was created and assigned to ${full.assignee?.name ?? "Unassigned"}.`,
        type: "assigned",
      });
    }

    void getOrCreateJobCliqChannel(full.job).catch((err) => {
      logger.warn({ err, jobId: full.job.id }, "Failed to initialize job Cliq channel metadata");
    });
    void provisionCliqChannelForJob(full.job).catch((err) => {
      void markJobCliqStatus(full.job.id, "failed", err instanceof Error ? err.message : String(err)).catch(() => {});
      logger.warn({ err, jobId: full.job.id }, "Failed to provision Cliq channel");
    });

    return res.status(201).json(await toPublicWithAssignees(full));
  } catch (err) {
    logger.error({ err }, "Failed to create job");
    return res.status(500).json({ error: "Failed to create job" });
  }
});

router.get("/jobs/:id", requireAuth, async (req, res) => {
  const id = req.params.id as string;
  const full = await loadJob(id);
  if (!full) return res.status(404).json({ error: "Job not found" });
  if (!(await canViewJob(req.session!.user, full.job))) {
    return res.status(403).json({ error: "You cannot view this job" });
  }
  return res.json(await toPublicWithAssignees(full));
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
  const jobNumber = body.jobNumber !== undefined ? normalizeJobNumber(body.jobNumber) : undefined;

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

  if (jobNumber && (await isJobNumberTaken(jobNumber, id))) {
    return res.status(400).json({ error: "Job number already exists" });
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.jobNumber !== undefined) patch.jobNumber = jobNumber;
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
        await createNotification({
          userId: oldAssigneeId,
          jobId: after.job.id,
          title: `Job Reassigned: ${after.job.title}`,
          description: `You have been removed from the job: ${after.job.title}.`,
          type: "updated"
        });
      }
      if (body.assigneeId) {
        await createNotification({
          userId: body.assigneeId,
          jobId: after.job.id,
          title: `New Job Assigned: ${after.job.title}`,
          description: `You have been assigned to a new job: ${after.job.title} for ${after.job.client}. Due Date: ${after.job.dueDate ? new Date(after.job.dueDate).toLocaleDateString() : "Not set"}`,
          type: "assigned"
        });
      }
      // Notify Supervisor and Admin on reassignment
      if (after.job.supervisorId) {
        await createNotification({
          userId: after.job.supervisorId,
          jobId: after.job.id,
          title: `Job Reassigned: ${after.job.title}`,
          description: `Assignee changed from ${full.assignee?.name ?? "None"} to ${after.assignee?.name ?? "None"}`,
          type: "updated"
        });
      }
      const admins = await db.select({ id: users.id }).from(users).where(inArray(users.role, ["admin", "super-admin"]));
      for (const admin of admins) {
        await createNotification({
          userId: admin.id,
          jobId: after.job.id,
          title: `Job Reassigned: ${after.job.title}`,
          description: `Assignee changed from ${full.assignee?.name ?? "None"} to ${after.assignee?.name ?? "None"}`,
          type: "updated"
        });
      }
    }

    // Check for supervisor change
    if (body.supervisorId !== undefined && body.supervisorId !== oldSupervisorId) {
      if (body.supervisorId) {
        await createNotification({
          userId: body.supervisorId,
          jobId: after.job.id,
          title: `New Job for Supervision: ${after.job.title}`,
          description: `You are now supervising this job: ${after.job.title}.`,
          type: "assigned"
        });
      }
    }

    await notifyJobContentUpdated(actor, full.job, after.job, body as Record<string, unknown>);

    void getOrCreateJobCliqChannel(after.job).catch((err) => {
      logger.warn({ err, jobId: after.job.id }, "Failed to refresh job Cliq channel metadata");
    });
    void provisionCliqChannelForJob(after.job).catch((err) => {
      void markJobCliqStatus(after.job.id, "failed", err instanceof Error ? err.message : String(err)).catch(() => {});
      logger.warn({ err, jobId: after.job.id }, "Failed to provision Cliq channel");
    });
  }
  return res.json(await toPublicWithAssignees(after!));
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
    logger.info({ body: req.body, headers: req.headers }, "[CLIQ-SYNC] Incoming request received");

    const configuredSecret = getCliqSyncSecret();
    if (!configuredSecret) {
      logger.error("[CLIQ-SYNC] ZOHO_CLIQ_SYNC_SECRET not configured in .env");
      return res.status(501).json({ error: "ZOHO_CLIQ_SYNC_SECRET not configured" });
    }

    const suppliedSecret =
      (typeof req.headers["x-cliq-sync-secret"] === "string" ? req.headers["x-cliq-sync-secret"] : "") ||
      (typeof req.query.secret === "string" ? req.query.secret : "") ||
      (typeof req.body?.secret === "string" ? req.body.secret : "");

    if (!suppliedSecret || suppliedSecret !== configuredSecret) {
      logger.warn({ supplied: suppliedSecret ? "REDACTED" : "MISSING", configured: "REDACTED" }, "[CLIQ-SYNC] Invalid sync secret");
      return res.status(401).json({ error: "Invalid Cliq sync secret" });
    }

    const message = parseIncomingCliqMessage(req.body);
    if (!message) {
      logger.warn({ body: req.body }, "[CLIQ-SYNC] Failed to parse Cliq payload");
      return res.status(400).json({ error: "Invalid Cliq payload" });
    }

    const full = await findJobByCliqChannel(message.channelId, message.channelName);
    if (!full) {
      logger.warn({ channelId: message.channelId, channelName: message.channelName }, "[CLIQ-SYNC] Job channel not found for channel");
      return res.status(404).json({ error: "Job channel not found" });
    }

    const actor = await findUserByEmail(message.senderEmail);
    if (!actor) {
      logger.warn({ senderEmail: message.senderEmail }, "[CLIQ-SYNC] User not found for senderEmail");
      await markJobCliqStatus(full.job.id, "active", `Cliq sync user not found for ${message.senderEmail}`);
      return res.json({
        ok: true,
        ignored: true,
        reason: `Cliq sender (${message.senderEmail}) not mapped to an app user`,
      });
    }

    if (!(await canViewJobCommunication(actor, full.job))) {
      logger.warn({ user: actor.email, jobId: full.job.id }, "[CLIQ-SYNC] User is not authorized to communicate on this job");
      await markJobCliqStatus(full.job.id, "active", `Cliq sync sender ${message.senderEmail} is not assigned to the job`);
      return res.json({
        ok: true,
        ignored: true,
        reason: "Cliq sender is not assigned to this job",
      });
    }

    logger.info({ user: actor.email, job: full.job.serial }, "[CLIQ-SYNC] Syncing message from Zoho Cliq");

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
      externalChannelId: message.channelId,
      externalChannelName: message.channelName,
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
          await createNotification({
            userId: rid,
            jobId: full.job.id,
            title: `Mentioned in ${full.job.title}`,
            description: `${actor.name} mentioned you in a message for ${full.job.title}: ${normalizedText}`,
            type: "job_message"
          });
        }
      } else {
        // Normal message notification
        await createNotification({
          userId: rid,
          jobId: full.job.id,
          title: `New Message: ${full.job.title}`,
          description: `${actor.name}: ${normalizedText}`,
          type: "job_message"
        });
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
    await ensureJobMessageSyncSchema();
    const rows = await db.execute(sql`
      SELECT
        jm.id,
        jm.text,
        jm.created_at,
        u.id AS user_id,
        u.name AS user_name,
        COALESCE(jms.source, 'app') AS source,
        COALESCE(jms.delivery_status, 'local_only') AS delivery_status
      FROM job_messages jm
      JOIN users u ON u.id = jm.user_id
      LEFT JOIN job_message_sync jms ON jms.job_message_id = jm.id
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
      source: MessageSource;
      delivery_status: MessageDeliveryState;
    }>;

    return res.json(
      items.map((m) => ({
        id: m.id,
        text: m.text,
        createdAt: m.created_at,
        isMe: m.user_id === actor.id,
        source: m.source,
        deliveryState: m.delivery_status,
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
      source: created.source,
      deliveryState: created.deliveryState,
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
    // #region debug-point B:channel-endpoint-response
    reportCliqDebug("B", "jobs.ts:/jobs/:id/cliq/channel", "[DEBUG] Returning Cliq channel payload", {
      jobId: full.job.id,
      actorId: actor.id,
      channelName: ch.channelName,
      channelId: ch.channelId,
      channelUrl: ch.channelUrl,
      status: ch.status,
      lastError: ch.lastError,
    });
    // #endregion
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
    // #region debug-point C:join-endpoint-response
    reportCliqDebug("C", "jobs.ts:/jobs/:id/cliq/join", "[DEBUG] Returning join result", {
      jobId: full.job.id,
      actorId: actor.id,
      actorEmail: email,
      channelId,
      channelName: ch.channelName,
      channelUrl: ch.channelUrl,
      status: ch.status,
    });
    // #endregion
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
