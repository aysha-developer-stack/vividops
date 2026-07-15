import { pgTable, uuid, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { jobs } from "./jobs";
import { users } from "./users";

export const jobReworks = pgTable(
  "job_reworks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdById: uuid("created_by_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    checklistItemId: integer("checklist_item_id"),
    cycleNumber: integer("cycle_number").notNull().default(1),
    reason: text("reason").notNull(),
    category: text("category").notNull().default("other"),
    comments: text("comments"),
    severity: text("severity").notNull().default("medium"),
    status: text("status").notNull().default("open"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("job_reworks_job_idx").on(t.jobId),
    index("job_reworks_user_idx").on(t.userId),
    index("job_reworks_status_idx").on(t.status),
    index("job_reworks_category_idx").on(t.category),
  ],
);

export type JobReworkRow = typeof jobReworks.$inferSelect;
export type JobReworkInsert = typeof jobReworks.$inferInsert;
