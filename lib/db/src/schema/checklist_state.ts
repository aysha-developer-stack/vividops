import { pgTable, uuid, integer, text, timestamp, index, unique } from "drizzle-orm/pg-core";
import { jobs } from "./jobs";
import { users } from "./users";

export const checklistItemStatusEnum = ["pending", "in_progress", "completed", "rework"] as const;

export const jobChecklistState = pgTable(
  "job_checklist_state",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    itemId: integer("item_id").notNull(),
    status: text("status").notNull(),
    reworkReason: text("rework_reason"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("job_checklist_state_job_user_item_uniq").on(t.jobId, t.userId, t.itemId),
    index("job_checklist_state_job_idx").on(t.jobId),
    index("job_checklist_state_user_idx").on(t.userId),
  ],
);

export type JobChecklistStateRow = typeof jobChecklistState.$inferSelect;
export type JobChecklistStateInsert = typeof jobChecklistState.$inferInsert;
