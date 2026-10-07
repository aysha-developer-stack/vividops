import { desc, eq } from "drizzle-orm";
import {
  db,
  builderSpecs,
  jobBuilderSpecs,
  jobs,
  type BuilderSpecRow,
  type JobBuilderSpecRow,
} from "@workspace/db";
import { ensureBuilderSpecsSchema } from "./schema-init";
import { logger } from "./logger";

export const BUILDER_NAME_MAX = 160;
export const BUILDER_SPEC_BODY_MAX = 20000;

export function builderKeyFromName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeBuilderName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, BUILDER_NAME_MAX);
}

export function normalizeSpecBody(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, BUILDER_SPEC_BODY_MAX);
}

export function serializeBuilderSpec(row: BuilderSpecRow) {
  return {
    id: row.id,
    builderName: row.builderName,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeJobBuilderSpec(
  row: JobBuilderSpecRow | null,
  fallbackName: string,
) {
  if (!row) {
    return {
      builderName: fallbackName,
      body: null as string | null,
      copiedAt: null as string | null,
    };
  }
  return {
    builderName: row.builderName,
    body: row.body,
    copiedAt: row.copiedAt.toISOString(),
  };
}

export async function findBuilderSpecByName(builderName: string): Promise<BuilderSpecRow | null> {
  const key = builderKeyFromName(builderName);
  if (!key) return null;
  const [row] = await db
    .select()
    .from(builderSpecs)
    .where(eq(builderSpecs.builderKey, key))
    .limit(1);
  return row ?? null;
}

export async function applyBuilderSpecsToJob(
  jobId: string,
  clientName: string,
): Promise<JobBuilderSpecRow | null> {
  try {
    await ensureBuilderSpecsSchema();
    const displayName = normalizeBuilderName(clientName);
    const key = builderKeyFromName(displayName);
    const [existing] = await db
      .select()
      .from(jobBuilderSpecs)
      .where(eq(jobBuilderSpecs.jobId, jobId))
      .limit(1);

    if (!key) {
      if (existing) {
        await db.delete(jobBuilderSpecs).where(eq(jobBuilderSpecs.jobId, jobId));
      }
      return null;
    }

    const library = await findBuilderSpecByName(displayName);
    if (!library) {
      if (existing) {
        await db.delete(jobBuilderSpecs).where(eq(jobBuilderSpecs.jobId, jobId));
      }
      return null;
    }

    const now = new Date();
    if (existing) {
      const [updated] = await db
        .update(jobBuilderSpecs)
        .set({
          builderName: library.builderName,
          builderKey: library.builderKey,
          body: library.body,
          sourceSpecId: library.id,
          copiedAt: now,
          updatedAt: now,
        })
        .where(eq(jobBuilderSpecs.jobId, jobId))
        .returning();
      return updated ?? null;
    }

    try {
      const [created] = await db
        .insert(jobBuilderSpecs)
        .values({
          jobId,
          builderName: library.builderName,
          builderKey: library.builderKey,
          body: library.body,
          sourceSpecId: library.id,
          copiedAt: now,
          updatedAt: now,
        })
        .returning();
      return created ?? null;
    } catch (err) {
      const code = typeof err === "object" && err && "code" in err ? String((err as { code?: string }).code) : "";
      const message = err instanceof Error ? err.message : String(err);
      if (code === "23505" || /job_builder_specs/i.test(message)) {
        const [row] = await db
          .select()
          .from(jobBuilderSpecs)
          .where(eq(jobBuilderSpecs.jobId, jobId))
          .limit(1);
        return row ?? null;
      }
      throw err;
    }
  } catch (err) {
    logger.warn({ err, jobId }, "Failed to apply builder specs to job");
    return null;
  }
}

export async function loadJobBuilderSpecSnapshot(jobId: string): Promise<JobBuilderSpecRow | null> {
  await ensureBuilderSpecsSchema();
  const [row] = await db
    .select()
    .from(jobBuilderSpecs)
    .where(eq(jobBuilderSpecs.jobId, jobId))
    .limit(1);
  return row ?? null;
}

export async function listBuilderSpecs(): Promise<BuilderSpecRow[]> {
  await ensureBuilderSpecsSchema();
  return db.select().from(builderSpecs).orderBy(desc(builderSpecs.updatedAt));
}

export async function listSuggestedBuilderNames(existingKeys: Set<string>): Promise<string[]> {
  const rows = await db
    .selectDistinct({ client: jobs.client })
    .from(jobs)
    .orderBy(jobs.client);

  const seen = new Set<string>();
  const names: string[] = [];
  for (const row of rows) {
    const name = normalizeBuilderName(row.client);
    const key = builderKeyFromName(name);
    if (!key || existingKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length >= 80) break;
  }
  names.sort((a, b) => a.localeCompare(b));
  return names;
}

export function isUniqueBuilderKeyError(err: unknown): boolean {
  const code = typeof err === "object" && err && "code" in err ? String((err as { code?: string }).code) : "";
  if (code === "23505") return true;
  const message = err instanceof Error ? err.message : String(err);
  return /builder_key|builder_specs_builder_key/i.test(message);
}
