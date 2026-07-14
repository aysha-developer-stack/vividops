import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, checklistTemplates, type ChecklistTemplateItemRow } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireAuth";

const router: IRouter = Router();
const managerOnly = requireRole("super-admin", "admin", "supervisor");

function normalizeItems(raw: unknown): ChecklistTemplateItemRow[] {
  if (!Array.isArray(raw)) return [];
  const items: ChecklistTemplateItemRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const text = typeof row.text === "string" ? row.text.trim() : "";
    if (!text) continue;
    const desc = typeof row.desc === "string" && row.desc.trim() ? row.desc.trim() : undefined;
    const attachmentRequired = Boolean(row.attachmentRequired);
    items.push({
      text,
      ...(desc ? { desc } : {}),
      ...(attachmentRequired ? { attachmentRequired: true } : {}),
    });
  }
  return items;
}

router.get("/checklist-templates", requireAuth, async (_req, res) => {
  const rows = await db.select().from(checklistTemplates).orderBy(desc(checklistTemplates.updatedAt));
  res.json(rows);
});

router.post("/checklist-templates", managerOnly, async (req, res) => {
  const actor = req.session!.user;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const description =
    typeof req.body?.description === "string" && req.body.description.trim()
      ? req.body.description.trim()
      : null;
  const items = normalizeItems(req.body?.items);

  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (items.length === 0) {
    res.status(400).json({ error: "At least one checklist item is required" });
    return;
  }

  const [created] = await db
    .insert(checklistTemplates)
    .values({
      name,
      description,
      items,
      createdById: actor.id,
      updatedAt: new Date(),
    })
    .returning();

  res.status(201).json(created);
  return;
});

router.patch("/checklist-templates/:id", managerOnly, async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [existing] = await db.select().from(checklistTemplates).where(eq(checklistTemplates.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof req.body?.name === "string" && req.body.name.trim()) patch.name = req.body.name.trim();
  if (typeof req.body?.description === "string") {
    patch.description = req.body.description.trim() || null;
  }
  if (req.body?.items !== undefined) {
    const items = normalizeItems(req.body.items);
    if (items.length === 0) {
      res.status(400).json({ error: "At least one checklist item is required" });
      return;
    }
    patch.items = items;
  }

  const [updated] = await db
    .update(checklistTemplates)
    .set(patch)
    .where(eq(checklistTemplates.id, id))
    .returning();
  res.json(updated);
  return;
});

router.delete("/checklist-templates/:id", managerOnly, async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [existing] = await db.select().from(checklistTemplates).where(eq(checklistTemplates.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await db.delete(checklistTemplates).where(eq(checklistTemplates.id, id));
  res.status(204).end();
  return;
});

export default router;
