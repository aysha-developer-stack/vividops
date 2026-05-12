import { Router, type IRouter } from "express";
import { eq, or, desc, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, jobs, users, type JobRow, type UserRow } from "@workspace/db";
import { CreateJobBody, UpdateJobBody } from "@workspace/api-zod";
import { publicJob } from "../lib/serialize";
import { requireAuth, requireRole } from "../middlewares/requireAuth";

const router: IRouter = Router();

const assigneeAlias = alias(users, "assignee");
const supervisorAlias = alias(users, "supervisor");

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

/**
 * Returns true if actor may view a job. Admins/super-admins see all.
 * Supervisors see jobs they supervise or created. Users see jobs assigned to them.
 */
function canViewJob(actor: UserRow, job: JobRow): boolean {
  if (actor.role === "super-admin" || actor.role === "admin") return true;
  if (actor.role === "supervisor") {
    return job.supervisorId === actor.id || job.createdById === actor.id;
  }
  return job.assigneeId === actor.id;
}

/**
 * Mutation rules:
 *  - super-admin / admin: full edit on any job
 *  - supervisor: edit only jobs they supervise or created
 *  - user (assignee): may only update progress + status (handled separately)
 */
function canManageJob(actor: UserRow, job: JobRow): boolean {
  if (actor.role === "super-admin" || actor.role === "admin") return true;
  if (actor.role === "supervisor") {
    return job.supervisorId === actor.id || job.createdById === actor.id;
  }
  return false;
}

router.get("/jobs", requireAuth, async (req, res) => {
  const actor = req.session!.user;
  const q = selectJoined();
  let rows;
  if (actor.role === "super-admin" || actor.role === "admin") {
    rows = await q.orderBy(desc(jobs.createdAt));
  } else if (actor.role === "supervisor") {
    rows = await q
      .where(
        or(
          eq(jobs.supervisorId, actor.id),
          eq(jobs.createdById, actor.id),
        ),
      )
      .orderBy(desc(jobs.createdAt));
  } else {
    rows = await q
      .where(eq(jobs.assigneeId, actor.id))
      .orderBy(desc(jobs.createdAt));
  }
  return res.json(
    rows.map((r) =>
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
      .select({ id: users.id, status: users.status })
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
  return res.status(201).json(rowToPublic(full!));
});

router.get("/jobs/:id", requireAuth, async (req, res) => {
  const id = req.params.id as string;
  const full = await loadJob(id);
  if (!full) return res.status(404).json({ error: "Job not found" });
  if (!canViewJob(req.session!.user, full.job)) {
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
      .select({ id: users.id, status: users.status })
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

  await db.update(jobs).set(patch).where(eq(jobs.id, id));
  const after = await loadJob(id);
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

export default router;
