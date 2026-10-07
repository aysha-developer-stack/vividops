import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, builderSpecs, jobs, type UserRow } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { ensureBuilderSpecsSchema } from "../lib/schema-init";
import {
  actorCanViewJobStakeholder,
  actorIsAssignedJobWorker,
} from "../lib/job-access";
import {
  applyBuilderSpecsToJob,
  BUILDER_NAME_MAX,
  BUILDER_SPEC_BODY_MAX,
  builderKeyFromName,
  findBuilderSpecByName,
  isUniqueBuilderKeyError,
  listBuilderSpecs,
  listSuggestedBuilderNames,
  loadJobBuilderSpecSnapshot,
  normalizeBuilderName,
  normalizeSpecBody,
  serializeBuilderSpec,
  serializeJobBuilderSpec,
} from "../lib/builder-specs";

const router: IRouter = Router();
const libraryEditors = requireRole("super-admin", "admin");

async function actorCanViewJob(actor: UserRow, job: typeof jobs.$inferSelect): Promise<boolean> {
  const extra = await actorIsAssignedJobWorker(actor, job);
  return actorCanViewJobStakeholder(actor, job, extra);
}

router.get("/builder-specs", libraryEditors, async (_req, res) => {
  try {
    const rows = await listBuilderSpecs();
    return res.json(rows.map(serializeBuilderSpec));
  } catch (err) {
    logger.error({ err }, "Failed to list builder specs");
    return res.status(500).json({ error: "Failed to load builder specs" });
  }
});

router.get("/builder-specs/suggestions", libraryEditors, async (_req, res) => {
  try {
    const rows = await listBuilderSpecs();
    const existing = new Set(rows.map((row) => row.builderKey));
    const clients = await listSuggestedBuilderNames(existing);
    return res.json({ clients });
  } catch (err) {
    logger.error({ err }, "Failed to list builder spec suggestions");
    return res.status(500).json({ error: "Failed to load builder names" });
  }
});

router.post("/builder-specs", libraryEditors, async (req, res) => {
  try {
    await ensureBuilderSpecsSchema();
    const actor = req.session!.user;
    const builderName = normalizeBuilderName(req.body?.builderName);
    const body = normalizeSpecBody(req.body?.body);
    if (!builderName) {
      return res.status(400).json({ error: "Builder name is required" });
    }
    if (!body) {
      return res.status(400).json({ error: "Specs text is required" });
    }
    if (builderName.length > BUILDER_NAME_MAX) {
      return res.status(400).json({ error: `Builder name must be ${BUILDER_NAME_MAX} characters or fewer` });
    }
    if (typeof req.body?.body === "string" && req.body.body.length > BUILDER_SPEC_BODY_MAX) {
      return res.status(400).json({ error: `Specs must be ${BUILDER_SPEC_BODY_MAX} characters or fewer` });
    }

    const key = builderKeyFromName(builderName);
    const duplicate = await findBuilderSpecByName(builderName);
    if (duplicate) {
      return res.status(409).json({ error: "Specs for this builder already exist" });
    }

    const now = new Date();
    const [created] = await db
      .insert(builderSpecs)
      .values({
        builderName,
        builderKey: key,
        body,
        createdById: actor.id,
        updatedById: actor.id,
        updatedAt: now,
      })
      .returning();
    if (!created) {
      return res.status(500).json({ error: "Failed to save builder specs" });
    }
    return res.status(201).json(serializeBuilderSpec(created));
  } catch (err) {
    if (isUniqueBuilderKeyError(err)) {
      return res.status(409).json({ error: "Specs for this builder already exist" });
    }
    logger.error({ err }, "Failed to create builder specs");
    return res.status(500).json({ error: "Failed to save builder specs" });
  }
});

router.patch("/builder-specs/:id", libraryEditors, async (req, res) => {
  try {
    await ensureBuilderSpecsSchema();
    const actor = req.session!.user;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const [existing] = await db.select().from(builderSpecs).where(eq(builderSpecs.id, id)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: "Builder specs not found" });
    }

    const patch: {
      builderName?: string;
      builderKey?: string;
      body?: string;
      updatedById: string;
      updatedAt: Date;
    } = {
      updatedById: actor.id,
      updatedAt: new Date(),
    };

    if (req.body?.builderName !== undefined) {
      const builderName = normalizeBuilderName(req.body.builderName);
      if (!builderName) {
        return res.status(400).json({ error: "Builder name is required" });
      }
      const key = builderKeyFromName(builderName);
      if (key !== existing.builderKey) {
        const duplicate = await findBuilderSpecByName(builderName);
        if (duplicate && duplicate.id !== existing.id) {
          return res.status(409).json({ error: "Specs for this builder already exist" });
        }
      }
      patch.builderName = builderName;
      patch.builderKey = key;
    }

    if (req.body?.body !== undefined) {
      const body = normalizeSpecBody(req.body.body);
      if (!body) {
        return res.status(400).json({ error: "Specs text is required" });
      }
      if (typeof req.body.body === "string" && req.body.body.length > BUILDER_SPEC_BODY_MAX) {
        return res.status(400).json({ error: `Specs must be ${BUILDER_SPEC_BODY_MAX} characters or fewer` });
      }
      patch.body = body;
    }

    const [updated] = await db
      .update(builderSpecs)
      .set(patch)
      .where(eq(builderSpecs.id, id))
      .returning();
    if (!updated) {
      return res.status(404).json({ error: "Builder specs not found" });
    }
    return res.json(serializeBuilderSpec(updated));
  } catch (err) {
    if (isUniqueBuilderKeyError(err)) {
      return res.status(409).json({ error: "Specs for this builder already exist" });
    }
    logger.error({ err }, "Failed to update builder specs");
    return res.status(500).json({ error: "Failed to save builder specs" });
  }
});

router.delete("/builder-specs/:id", libraryEditors, async (req, res) => {
  try {
    await ensureBuilderSpecsSchema();
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const [existing] = await db.select({ id: builderSpecs.id }).from(builderSpecs).where(eq(builderSpecs.id, id)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: "Builder specs not found" });
    }
    await db.delete(builderSpecs).where(eq(builderSpecs.id, id));
    return res.status(204).end();
  } catch (err) {
    logger.error({ err }, "Failed to delete builder specs");
    return res.status(500).json({ error: "Failed to delete builder specs" });
  }
});

router.get("/jobs/:jobId/builder-specs", requireAuth, async (req, res) => {
  try {
    const actor = req.session!.user;
    const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    if (!(await actorCanViewJob(actor, job))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    let snapshot = await loadJobBuilderSpecSnapshot(job.id);
    if (!snapshot) {
      snapshot = await applyBuilderSpecsToJob(job.id, job.client);
    }
    return res.json(serializeJobBuilderSpec(snapshot, job.client));
  } catch (err) {
    logger.error({ err }, "Failed to load job builder specs");
    return res.status(500).json({ error: "Failed to load builder specs" });
  }
});

export default router;
