import { pgTable, uuid, integer, timestamp, index } from "drizzle-orm/pg-core";
import { jobs } from "./jobs";
import { users } from "./users";
import { jobAttachments } from "./attachments";

export const jobChecklistAttachments = pgTable(
  "job_checklist_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    itemId: integer("item_id").notNull(),
    attachmentId: uuid("attachment_id").notNull().references(() => jobAttachments.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("job_checklist_attachments_job_idx").on(t.jobId),
    index("job_checklist_attachments_user_idx").on(t.userId),
    index("job_checklist_attachments_item_idx").on(t.jobId, t.userId, t.itemId),
  ],
);

export type JobChecklistAttachmentRow = typeof jobChecklistAttachments.$inferSelect;
export type JobChecklistAttachmentInsert = typeof jobChecklistAttachments.$inferInsert;
