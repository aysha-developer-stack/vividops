import { Router, type IRouter } from "express";
import { and, eq, or, desc, inArray, ne, sql as dsql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, jobs, users, jobMembers, jobAttachments, jobChecklistAttachments, jobReworks, errorReports, type JobRow, type UserRow, sql } from "@workspace/db";
import { createNotification, createNotificationOnce } from "../lib/notifications";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { CreateJobBody, UpdateJobBody } from "@workspace/api-zod";
import { buildJobAssignees, publicJob } from "../lib/serialize";
import { parseJobMeta, serializeJobMeta } from "../lib/jobMeta";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { getZohoCliqAccessToken } from "../lib/zoho";
import {
  ensureAllSchemas,
  ensureJobMessageSyncSchema,
  ensureJobWriteSchema,
  ensureLegacySupervisorAssignments,
} from "../lib/schema-init";
import {
  applyJobReview,
  coerceCompletionStatus,
  jobStatusPatchFields,
  notifyStatusTransition,
  type JobReviewAction,
  type ReviewableStatus,
} from "../lib/job-review";

import { shouldSendNotification } from "../lib/notifications";

const router: IRouter = Router();

const assigneeAlias = alias(users, "assignee");
const supervisorAlias = alias(users, "supervisor");
const reworkUserAlias = alias(users, "rework_user");
const reworkCreatorAlias = alias(users, "rework_creator");

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
    let pub = rowToPublic(full, membersByJob.get(full.job.id) ?? []);

    // Recover checklist from uploaded checklist files when job meta has none
    if (!Array.isArray(pub.checklist) || pub.checklist.length === 0) {
      try {
        const linked = await db
          .select({
            itemId: jobChecklistAttachments.itemId,
            fileName: jobAttachments.fileName,
          })
          .from(jobChecklistAttachments)
          .innerJoin(jobAttachments, eq(jobAttachments.id, jobChecklistAttachments.attachmentId))
          .where(eq(jobChecklistAttachments.jobId, full.job.id))
          .orderBy(jobChecklistAttachments.itemId);

        if (linked.length > 0) {
          const byItem = new Map<number, string>();
          for (const row of linked) {
            if (!byItem.has(row.itemId)) byItem.set(row.itemId, row.fileName);
          }
          const checklist = [...byItem.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([, fileName]) => ({ text: fileName }));

          const meta = parseJobMeta(full.job.description);
          const description = serializeJobMeta(meta.descriptionText || pub.descriptionText || "", checklist);
          await db
            .update(jobs)
            .set({ description, updatedAt: new Date() })
            .where(eq(jobs.id, full.job.id));

          pub = {
            ...pub,
            description,
            checklist,
            descriptionText: meta.descriptionText || pub.descriptionText || "",
          };
        }
      } catch (err) {
        logger.warn({ err, jobId: full.job.id }, "Failed to recover checklist from attachments");
      }
    }

    return pub;
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
    .slice(0, 40);
}

function computeCliqChannelName(job: JobRow): string {
  const numberSeed = job.jobNumber?.trim() || String(job.serial);
  const numberPart = `job-${slugifyChannel(numberSeed) || job.serial}`;
  const titlePart = slugifyChannel(job.title || "job");
  const addressPart = slugifyChannel(job.address || "");
  return [numberPart, titlePart, addressPart].filter(Boolean).join("-").slice(0, 80);
}

function computeCliqChannelDisplayName(job: JobRow): string {
  return computeCliqChannelName(job);
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
  const companyId =
    pickString(process.env.ZOHO_CLIQ_COMPANY_ID) ??
    value.match(/_(\d+)$/)?.[1] ??
    null;
  if (companyId) {
    return `${cliqWebRoot()}/company/${encodeURIComponent(companyId)}/chats/${encodeURIComponent(value)}`;
  }
  return `${cliqWebRoot()}/app/chats/${encodeURIComponent(value)}`;
}

function isGeneratedCliqChannelUrl(url: string | null | undefined): boolean {
  return typeof url === "string" && /\/channels\/[^/]+$/i.test(url);
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
    computeCliqChatUrl(chatId) ??
    pickString(item.permalink) ??
    pickString(item.channel_url) ??
    pickString(item.url) ??
    pickString(item.web_url) ??
    pickString(item.webUrl) ??
    computeCliqChannelUrl(channelName ?? "");
  if (!channelId && !channelName && !channelUrl && !chatId) return null;
  return { channelId, channelName, channelUrl, chatId };
}

type JobCliqChannelRecord = {
  channelName: string;
  channelId: string | null;
  chatId: string | null;
  channelUrl: string | null;
  status: string;
  lastError: string | null;
};

async function persistJobCliqChannelRecord(
  jobId: string,
  resolved: CliqChannelLookup,
  status: string,
  lastError: string | null,
  fallbackName: string,
): Promise<JobCliqChannelRecord> {
  const channelName = resolved.channelName ?? fallbackName;
  const channelId = resolved.channelId ?? null;
  const chatId = resolved.chatId ?? null;
  const channelUrl = computeCliqChatUrl(chatId) ?? resolved.channelUrl ?? computeCliqChannelUrl(channelName);
  await db.execute(sql`
    UPDATE job_cliq_channels
    SET channel_name = ${channelName},
        channel_id = ${channelId},
        chat_id = ${chatId},
        channel_url = ${channelUrl},
        updated_at = now()
    WHERE job_id = ${jobId}
  `);
  return { channelName, channelId, chatId, channelUrl, status, lastError };
}

function getCliqBotUniqueName(): string | null {
  const raw = (process.env.ZOHO_CLIQ_BOT_UNIQUE_NAME || "vividopssync").trim();
  return raw || null;
}

function uniqueChannelNameCandidates(channelName: string, job: JobRow): string[] {
  const names = new Set<string>();
  const add = (value: string | null | undefined) => {
    const trimmed = pickString(value);
    if (trimmed) names.add(trimmed);
  };
  const numberSeed = job.jobNumber?.trim() || String(job.serial);
  const numberPart = `job-${slugifyChannel(numberSeed) || job.serial}`;
  const titlePart = slugifyChannel(job.title || "job");
  const addressPart = slugifyChannel(job.address || "");
  add(channelName);
  add(computeCliqChannelName(job));
  add([numberPart, titlePart, addressPart].filter(Boolean).join("-").slice(0, 80)); // previous format
  add([numberPart, titlePart, addressPart].filter(Boolean).join("").slice(0, 80)); // Cliq-stripped previous format
  add([numberPart, titlePart].filter(Boolean).join("").slice(0, 60)); // Cliq-stripped current format
  for (const name of [...names]) {
    if (name.length > 1) add(name.slice(0, -1));
    add(`${name}d`);
  }
  return Array.from(names);
}

async function refreshJobCliqChannelForPush(job: JobRow, current: JobCliqChannelRecord): Promise<JobCliqChannelRecord> {
  try {
    const token = await getZohoCliqAccessToken();
    if (current.channelId) {
      const byId = await resolveCliqChannelById(token, current.channelId);
      if (byId) {
        return persistJobCliqChannelRecord(job.id, byId, current.status, current.lastError, current.channelName);
      }
    }
    for (const name of uniqueChannelNameCandidates(current.channelName, job)) {
      const byName = await resolveCliqChannelByName(token, name);
      if (byName?.channelId || byName?.channelName || byName?.chatId) {
        return persistJobCliqChannelRecord(job.id, byName, current.status, current.lastError, name);
      }
    }
  } catch (err) {
    logger.warn({ err, jobId: job.id }, "[CLIQ-PUSH] Failed to refresh channel mapping before push");
  }
  return current;
}

async function getOrCreateJobCliqChannel(job: JobRow): Promise<JobCliqChannelRecord> {
  await ensureJobCliqSchema();
  const rows = await db.execute(sql`
    SELECT channel_name, channel_id, chat_id, channel_url, status, last_error
    FROM job_cliq_channels
    WHERE job_id = ${job.id}
    LIMIT 1
  `);
  const existing = (rows as any).rows?.[0] as
    | {
        channel_name: string;
        channel_id: string | null;
        chat_id: string | null;
        channel_url: string | null;
        status: string;
        last_error: string | null;
      }
    | undefined;
  if (existing?.channel_name) {
    const expectedName = computeCliqChannelName(job);
    let finalName = existing.channel_name;
    let finalId = existing.channel_id ?? null;
    let finalChatId = existing.chat_id ?? null;
    let finalUrl =
      isGeneratedCliqChannelUrl(existing.channel_url)
        ? computeCliqChatUrl(finalChatId) ?? existing.channel_url
        : existing.channel_url ?? computeCliqChatUrl(finalChatId) ?? computeCliqChannelUrl(finalName);

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
        storedChatId: existing.chat_id,
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
        finalChatId = resolved.chatId ?? finalChatId;
        finalName = resolved.channelName ?? finalName;
        finalUrl = resolved.channelUrl ?? computeCliqChatUrl(finalChatId) ?? computeCliqChannelUrl(finalName);
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
      (existing.chat_id ?? null) !== finalChatId ||
      (existing.channel_url ?? null) !== finalUrl
    ) {
      await db.execute(sql`
        UPDATE job_cliq_channels
        SET channel_name = ${finalName},
            channel_id = ${finalId},
            chat_id = ${finalChatId},
            channel_url = ${finalUrl},
            updated_at = now()
        WHERE job_id = ${job.id}
      `);

      return {
        channelName: finalName,
        channelId: finalId,
        chatId: finalChatId,
        channelUrl: finalUrl,
        status: existing.status,
        lastError: existing.last_error ?? null,
      };
    }

    return {
      channelName: finalName,
      channelId: finalId,
      chatId: finalChatId,
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

  return { channelName, channelId: null, chatId: null, channelUrl, status: "pending", lastError: null };
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
      "[CLIQ] Failed to ensure bot is associated with channel",
    );
  }
}

function getCliqChannelAdminEmail(): string {
  const raw = (process.env.ZOHO_CLIQ_CHANNEL_ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL || "").trim();
  return raw.toLowerCase();
}

async function listCliqChannelMemberEmails(job: JobRow): Promise<string[]> {
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

  const idList = Array.from(ids);
  const participantRows =
    idList.length === 0
      ? []
      : await db
          .select({ email: users.email })
          .from(users)
          .where(inArray(users.id, idList));

  const emails = new Set(
    participantRows
      .map((r) => (typeof r.email === "string" ? r.email.trim() : ""))
      .filter(Boolean),
  );

  const adminEmail = getCliqChannelAdminEmail();
  if (adminEmail) emails.add(adminEmail);

  return Array.from(emails);
}

type CliqChannelMember = {
  user_id: string;
  email_id: string;
  user_role: string;
};

async function fetchCliqChannelMembers(token: string, channelId: string): Promise<CliqChannelMember[]> {
  const res = await fetch(`${cliqApiRoot()}/channels/${encodeURIComponent(channelId)}/members`, {
    method: "GET",
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.warn({ channelId, status: res.status, body }, "[CLIQ] Failed to list channel members");
    return [];
  }
  const json = (await res.json().catch(() => null)) as { members?: CliqChannelMember[] } | null;
  return Array.isArray(json?.members) ? json.members : [];
}

async function addCliqChannelMembersByEmail(
  token: string,
  channelId: string | null,
  channelName: string,
  emails: string[],
): Promise<string | null> {
  if (emails.length === 0) return null;
  const addUrl = channelId
    ? `${cliqApiRoot()}/channels/${encodeURIComponent(channelId)}/members`
    : `${cliqApiRoot()}/channelsbyname/${encodeURIComponent(channelName)}/members`;
  const addRes = await fetch(addUrl, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email_ids: emails }),
  });
  if (!addRes.ok) {
    const body = await addRes.text().catch(() => "");
    return `Cliq add channel members failed (${addRes.status}): ${body}`;
  }
  return null;
}

async function setCliqChannelMemberRole(
  token: string,
  channelId: string,
  userId: string,
  role: "super_admin" | "admin" | "moderator" | "member",
): Promise<string | null> {
  const headers = {
    Authorization: `Zoho-oauthtoken ${token}`,
    "Content-Type": "application/json",
  };
  const body = JSON.stringify({ role });
  const urls = [
    `${cliqApiRoot()}/channels/${encodeURIComponent(channelId)}/members/${encodeURIComponent(userId)}`,
    `${cliqApiRoot()}/channels/${encodeURIComponent(channelId)}/members/${encodeURIComponent(userId)}/members`,
  ];
  const errors: string[] = [];
  for (const url of urls) {
    const res = await fetch(url, { method: "PUT", headers, body });
    if (res.ok) return null;
    const responseBody = await res.text().catch(() => "");
    errors.push(`${url} (${res.status}): ${responseBody}`);
  }
  return `Cliq update channel member role failed: ${errors.join(" | ")}`;
}

function combineCliqProvisionErrors(...errors: Array<string | null | undefined>): string | null {
  const combined = errors.filter((value): value is string => Boolean(value)).join(" | ");
  return combined || null;
}

async function alignCliqChannelSuperAdmin(
  token: string,
  channelId: string,
  channelName: string,
): Promise<string | null> {
  const adminEmail = getCliqChannelAdminEmail();
  if (!adminEmail) return null;

  const memberAddError = await addCliqChannelMembersByEmail(token, channelId, channelName, [adminEmail]);
  if (memberAddError) {
    logger.warn({ channelId, channelName, adminEmail, memberAddError }, "[CLIQ] Could not ensure channel admin member");
  }

  const members = await fetchCliqChannelMembers(token, channelId);
  if (members.length === 0) {
    return memberAddError ?? "Could not resolve Cliq channel members for super-admin alignment";
  }

  const adminMember = members.find((member) => (member.email_id || "").trim().toLowerCase() === adminEmail);
  if (!adminMember?.user_id) {
    return memberAddError ?? `Cliq channel admin user not found: ${adminEmail}`;
  }

  const promoteError = await setCliqChannelMemberRole(token, channelId, adminMember.user_id, "super_admin");
  if (promoteError) return promoteError;

  const demoteErrors: string[] = [];
  for (const member of members) {
    if (member.user_id === adminMember.user_id) continue;
    if ((member.user_role || "").toLowerCase() !== "super_admin") continue;
    const demoteError = await setCliqChannelMemberRole(token, channelId, member.user_id, "member");
    if (demoteError) demoteErrors.push(demoteError);
  }

  return combineCliqProvisionErrors(memberAddError, demoteErrors.length > 0 ? demoteErrors.join(" | ") : null);
}

async function postCliqMessageToChannel(
  channelName: string,
  channelId: string | null,
  chatId: string | null,
  nameCandidates: string[],
  text: string,
): Promise<string | null> {
  const token = await getZohoCliqAccessToken();
  const headers = {
    Authorization: `Zoho-oauthtoken ${token}`,
    "Content-Type": "application/json",
  };
  const body = JSON.stringify({ text });
  const botName = getCliqBotUniqueName();
  const attempts: string[] = [];

  for (const name of nameCandidates) {
    await ensureCliqBotInChannel(name);
  }

  if (botName) {
    for (const name of nameCandidates) {
      const encoded = encodeURIComponent(name);
      attempts.push(
        `${cliqApiRoot()}/channelsbyname/${encoded}/message?bot_unique_name=${encodeURIComponent(botName)}`,
      );
    }
    if (channelId) {
      attempts.push(
        `${cliqApiRoot()}/channels/${encodeURIComponent(channelId)}/message?bot_unique_name=${encodeURIComponent(botName)}`,
      );
    }
  }

  if (chatId) {
    attempts.push(`${cliqApiRoot()}/chats/${encodeURIComponent(chatId)}/message`);
  }
  if (channelId) {
    attempts.push(`${cliqApiRoot()}/channels/${encodeURIComponent(channelId)}/message`);
  }
  for (const name of nameCandidates) {
    attempts.push(`${cliqApiRoot()}/channelsbyname/${encodeURIComponent(name)}/message`);
  }

  const errors: string[] = [];
  for (const url of attempts) {
    const res = await fetch(url, { method: "POST", headers, body });
    if (res.ok) {
      return parseCliqPostedMessageId(await res.json().catch(() => null));
    }
    const responseBody = await res.text().catch(() => "");
    errors.push(`${url} (${res.status}): ${responseBody}`);
    logger.warn({ url, status: res.status, body: responseBody }, "[CLIQ-PUSH] Channel message attempt failed");
  }

  throw new Error(`Cliq channel message failed: ${errors.join(" | ")}`);
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
  const prefixes = [
    `JOB-${job.jobNumber?.trim() || job.serial} - ${job.title}`,
    `JOB-${job.serial} · ${job.title}`,
  ];
  const prefix = prefixes.find((p) => trimmed.startsWith(`${p}\n`));
  if (!prefix) return trimmed;
  const remainder = trimmed.slice(prefix.length + 1).trim();
  const website = remainder.match(/^(?:From website|Vivid OPS)\s*\(([^)]+)\):\s*([\s\S]+)$/i);
  if (website?.[2]) return website[2].trim();
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
  deliveryError?: string | null;
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
  let deliveryError: string | null = null;

  if (pushToCliq) {
    const prefix = `JOB-${job.jobNumber?.trim() || job.serial} - ${job.title}`;
    const payload = `${prefix}\nVivid OPS (${actor.name}): ${cleanText}`;
    logger.info({ jobId: job.id, channelName: computeCliqChannelName(job) }, "[CLIQ-PUSH] Attempting to push message to Zoho Cliq");
    try {
      let ch = await getOrCreateJobCliqChannel(job);
      if (ch.status !== "active") {
        logger.info({ jobId: job.id, status: ch.status }, "[CLIQ-PUSH] Channel not active, provisioning first");
        await provisionCliqChannelForJob(job);
        ch = await getOrCreateJobCliqChannel(job);
      }
      ch = await refreshJobCliqChannelForPush(job, ch);
      const nameCandidates = uniqueChannelNameCandidates(ch.channelName, job);
      const externalId = await postCliqMessageToChannel(
        ch.channelName,
        ch.channelId,
        ch.chatId,
        nameCandidates,
        payload,
      );
      await upsertJobMessageSync({
        jobId: job.id,
        jobMessageId: msgId,
        source: "app",
        direction: "outbound",
        externalMessageId: externalId,
        externalChannelId: ch.channelId ?? ch.chatId,
        externalChannelName: ch.channelName,
        senderEmail: null,
        payload: { text: payload, chatId: ch.chatId },
        deliveryStatus: "sent",
      });
      deliveryState = "sent";
      logger.info(
        { jobId: job.id, channel: ch.channelName, channelId: ch.channelId, chatId: ch.chatId },
        "[CLIQ-PUSH] Successfully pushed message to job channel",
      );
    } catch (errToken) {
      const errMessage = errToken instanceof Error ? errToken.message : String(errToken);
      logger.error({ err: errMessage, jobId: job.id }, "[CLIQ-PUSH] Failed to send message to job channel");
      await upsertJobMessageSync({
        jobId: job.id,
        jobMessageId: msgId,
        source: "app",
        direction: "outbound",
        externalChannelName: computeCliqChannelName(job),
        senderEmail: null,
        payload: { text: payload },
        deliveryStatus: "failed",
        lastError: errMessage,
      });
      deliveryState = "failed";
      deliveryError = errMessage;
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
    deliveryError,
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

  const participantEmails = await listCliqChannelMemberEmails(job);

  await markJobCliqStatus(job.id, "provisioning", null);

  if (ch.status === "active" && !ch.lastError && ch.channelId) {
    const memberAddError =
      participantEmails.length > 0
        ? await addCliqChannelMembersByEmail(token, ch.channelId, channelName, participantEmails)
        : null;
    const adminAlignError = await alignCliqChannelSuperAdmin(token, ch.channelId, channelName);

    await db.execute(sql`
      UPDATE job_cliq_channels
      SET status = 'active',
          last_error = ${combineCliqProvisionErrors(memberAddError, adminAlignError)},
          updated_at = now()
      WHERE job_id = ${job.id}
    `);
    return;
  }

  // First check if channel already exists in Cliq, including older generated names.
  let existingChannel: CliqChannelLookup | null = null;
  for (const candidate of uniqueChannelNameCandidates(channelName, job)) {
    existingChannel = await resolveCliqChannelByName(token, candidate);
    if (existingChannel?.channelId || existingChannel?.channelName || existingChannel?.chatId) break;
  }
  let createdChannelName = existingChannel?.channelName ?? channelName;
  let createdChannelUrl = existingChannel?.channelUrl ?? computeCliqChannelUrl(createdChannelName);
  let discoveredChannelId: string | null = existingChannel?.channelId ?? null;
  let discoveredChatId: string | null = existingChannel?.chatId ?? null;

  // Only create new channel if it doesn't exist yet
  if (!discoveredChannelId) {
    const rawLevel = (process.env.ZOHO_CLIQ_CHANNEL_LEVEL || "private").trim().toLowerCase();
    const level =
      rawLevel === "organization" || rawLevel === "team" || rawLevel === "private" || rawLevel === "external"
        ? rawLevel
        : "private";

    const createBody: Record<string, unknown> = {
      level,
      name: channelName,
      description: `Job channel for ${computeCliqChannelDisplayName(job)}`,
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
      computeCliqChatUrl(discoveredChatId) ??
      pickString(createJson?.data?.permalink) ??
      pickString(createJson?.data?.channel_url) ??
      pickString(createJson?.data?.url) ??
      pickString(createJson?.data?.web_url) ??
      pickString(createJson?.permalink) ??
      pickString(createJson?.url) ??
      pickString(createJson?.web_url) ??
      computeCliqChannelUrl(discoveredName ?? channelName);
    createdChannelUrl = discoveredUrl ?? computeCliqChannelUrl(createdChannelName);
  }

  await db.execute(sql`
    UPDATE job_cliq_channels
    SET channel_name = ${createdChannelName},
        channel_id = ${discoveredChannelId},
        chat_id = ${discoveredChatId},
        channel_url = ${createdChannelUrl},
        updated_at = now()
    WHERE job_id = ${job.id}
  `);

  await ensureCliqBotInChannel(createdChannelName);

  const channelIdForMembers = discoveredChannelId ?? ch.channelId;
  const memberAddError =
    participantEmails.length > 0
      ? await addCliqChannelMembersByEmail(token, channelIdForMembers, createdChannelName, participantEmails)
      : null;
  const adminAlignError = channelIdForMembers
    ? await alignCliqChannelSuperAdmin(token, channelIdForMembers, createdChannelName)
    : null;

  const channelUrl = createdChannelUrl;
  await db.execute(sql`
    UPDATE job_cliq_channels
    SET channel_url = ${channelUrl},
        chat_id = ${discoveredChatId},
        status = 'active',
        last_error = ${combineCliqProvisionErrors(memberAddError, adminAlignError)},
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
      estimatedTime: body.estimatedTime?.trim() ? body.estimatedTime.trim() : null,
      startDate: body.startDate ? new Date(body.startDate) : null,
      eta: body.eta ? new Date(body.eta) : null,
      wind: body.wind ?? null,
      incomingDate: body.incomingDate ? new Date(body.incomingDate) : null,
      remarks: body.remarks?.trim() ? body.remarks.trim() : null,
      comments: body.comments?.trim() ? body.comments.trim() : null,
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

  // Assignees cannot change status while job is on hold.
  if (full.job.status === "on_hold" && !isManager && body.status !== undefined) {
    return res.status(403).json({ error: "Job is on hold — contact your supervisor to resume" });
  }

  const previousStatus = full.job.status;
  let nextStatus: ReviewableStatus | undefined =
    body.status !== undefined ? (body.status as ReviewableStatus) : undefined;
  if (nextStatus === "on_hold") {
    if (!isManager) {
      return res.status(403).json({ error: "Only supervisor, admin, or super-admin can put a job on hold" });
    }
    if (previousStatus === "completed" || previousStatus === "cancelled" || previousStatus === "on_hold") {
      return res.status(400).json({ error: "This job cannot be put on hold" });
    }
  }
  if (previousStatus === "on_hold" && nextStatus !== undefined && nextStatus !== "on_hold") {
    if (!isManager) {
      return res.status(403).json({ error: "Only supervisor, admin, or super-admin can resume a job on hold" });
    }
    if (nextStatus === "in_progress" || nextStatus === "pending") {
      const { resolveResumeStatus } = await import("../lib/job-review");
      nextStatus = resolveResumeStatus(full.job);
    }
  }
  if (!isManager && nextStatus === "on_hold") {
    return res.status(403).json({ error: "Only supervisor, admin, or super-admin can put a job on hold" });
  }

  if (nextStatus === "completed") {
    nextStatus = coerceCompletionStatus(actor, isManager);
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.jobNumber !== undefined) patch.jobNumber = jobNumber;
  if (body.title !== undefined) patch.title = body.title;
  if (body.client !== undefined) patch.client = body.client;
  if (body.address !== undefined) patch.address = body.address;
  if (body.description !== undefined) patch.description = body.description;
  if (body.priority !== undefined) patch.priority = body.priority;
  if (nextStatus !== undefined) {
    Object.assign(
      patch,
      jobStatusPatchFields({
        nextStatus,
        previousStatus,
        currentProgress: body.progress ?? full.job.progress,
      }),
    );
  }
  if (body.assigneeId !== undefined) patch.assigneeId = body.assigneeId;
  if (body.supervisorId !== undefined) patch.supervisorId = body.supervisorId;
  if (body.dueDate !== undefined) {
    patch.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  }
  if (body.estimatedTime !== undefined) {
    patch.estimatedTime = body.estimatedTime?.trim() ? body.estimatedTime.trim() : null;
  }
  if (body.startDate !== undefined) {
    patch.startDate = body.startDate ? new Date(body.startDate) : null;
  }
  if (body.eta !== undefined) {
    patch.eta = body.eta ? new Date(body.eta) : null;
  }
  if (body.wind !== undefined) {
    patch.wind = body.wind ?? null;
  }
  if (body.incomingDate !== undefined) {
    patch.incomingDate = body.incomingDate ? new Date(body.incomingDate) : null;
  }
  if (body.remarks !== undefined) {
    patch.remarks = body.remarks?.trim() ? body.remarks.trim() : null;
  }
  if (body.comments !== undefined) {
    patch.comments = body.comments?.trim() ? body.comments.trim() : null;
  }
  if (body.progress !== undefined) patch.progress = body.progress;

  const oldAssigneeId = full.job.assigneeId;
  const oldSupervisorId = full.job.supervisorId;

  await db.update(jobs).set(patch).where(eq(jobs.id, id));
  const after = await loadJob(id);
  if (after) {
    if (nextStatus !== undefined && nextStatus !== previousStatus) {
      await notifyStatusTransition({
        actor,
        job: after.job,
        previousStatus,
        nextStatus,
      });
    }

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

router.post("/jobs/:id/review", requireAuth, async (req, res) => {
  try {
    await ensureJobWriteSchema();
    const id = req.params.id as string;
    const actor = req.session!.user;
    const action = req.body?.action as JobReviewAction | undefined;
    const reason = typeof req.body?.reason === "string" ? req.body.reason : null;
    const category = typeof req.body?.category === "string" ? req.body.category : null;
    const comments = typeof req.body?.comments === "string" ? req.body.comments : null;
    const dueAt = typeof req.body?.dueAt === "string" ? req.body.dueAt : null;
    const severity = typeof req.body?.severity === "string" ? req.body.severity : null;
    const allowed: JobReviewAction[] = [
      "submit_for_supervisor",
      "supervisor_approve",
      "admin_complete",
      "rework",
      "resume_from_hold",
    ];
    if (!action || !allowed.includes(action)) {
      return res.status(400).json({ error: "Invalid review action" });
    }

    const full = await loadJob(id);
    if (!full) return res.status(404).json({ error: "Job not found" });
    if (!(await canViewJob(actor, full.job))) {
      return res.status(403).json({ error: "You cannot review this job" });
    }

    const result = await applyJobReview({
      actor,
      job: full.job,
      action,
      reason,
      category,
      comments,
      dueAt,
      severity,
      canManage: canManageJob(actor, full.job),
    });
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    const after = await loadJob(id);
    return res.json(await toPublicWithAssignees(after!));
  } catch (err) {
    logger.error({ err }, "Failed to review job");
    return res.status(500).json({ error: "Failed to review job" });
  }
});

router.get("/jobs/:id/reworks", requireAuth, async (req, res) => {
  try {
    await ensureJobWriteSchema();
    const id = req.params.id as string;
    const actor = req.session!.user;
    const full = await loadJob(id);
    if (!full) return res.status(404).json({ error: "Job not found" });
    if (!(await canViewJob(actor, full.job))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const rows = await db
      .select({
        rework: jobReworks,
        user: { id: reworkUserAlias.id, name: reworkUserAlias.name, role: reworkUserAlias.role },
        createdBy: { id: reworkCreatorAlias.id, name: reworkCreatorAlias.name, role: reworkCreatorAlias.role },
        errorReportId: errorReports.id,
      })
      .from(jobReworks)
      .leftJoin(reworkUserAlias, eq(reworkUserAlias.id, jobReworks.userId))
      .leftJoin(reworkCreatorAlias, eq(reworkCreatorAlias.id, jobReworks.createdById))
      .leftJoin(errorReports, eq(errorReports.reworkId, jobReworks.id))
      .where(eq(jobReworks.jobId, id))
      .orderBy(desc(jobReworks.assignedAt));

    return res.json(
      rows.map((row) => ({
        id: row.rework.id,
        jobId: row.rework.jobId,
        userId: row.rework.userId,
        createdById: row.rework.createdById,
        checklistItemId: row.rework.checklistItemId,
        cycleNumber: row.rework.cycleNumber,
        reason: row.rework.reason,
        category: row.rework.category,
        comments: row.rework.comments,
        severity: row.rework.severity,
        status: row.rework.status,
        dueAt: row.rework.dueAt,
        assignedAt: row.rework.assignedAt,
        completedAt: row.rework.completedAt,
        approvedAt: row.rework.approvedAt,
        errorReportId: row.errorReportId ?? null,
        user: row.user?.id ? row.user : null,
        createdBy: row.createdBy?.id ? row.createdBy : null,
      })),
    );
  } catch (err) {
    logger.error({ err }, "Failed to load job reworks");
    return res.status(500).json({ error: "Internal server error" });
  }
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
      deliveryError: created.deliveryError ?? null,
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
    return res.json({ success: true, channelUrl: ch.channelUrl, channelName: ch.channelName, chatId: ch.chatId });
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
