import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { users } from "./users";

export type ChecklistTemplateItemRow = {
  text: string;
  desc?: string;
  attachmentRequired?: boolean;
};

export const checklistTemplates = pgTable(
  "checklist_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    items: jsonb("items").$type<ChecklistTemplateItemRow[]>().notNull().default([]),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("checklist_templates_name_idx").on(t.name)],
);

export type ChecklistTemplateRow = typeof checklistTemplates.$inferSelect;
export type ChecklistTemplateInsert = typeof checklistTemplates.$inferInsert;
