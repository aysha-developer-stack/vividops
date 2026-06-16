import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { jobs } from "./jobs";
import { users } from "./users";

export const jobAttachments = pgTable(
  "job_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    fileKey: text("file_key").notNull(), // S3 key
    fileUrl: text("file_url").notNull(),
    fileType: text("file_type"),
    fileSize: text("file_size"),
    uploadedById: uuid("uploaded_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("job_attachments_job_idx").on(t.jobId)]
);

export type JobAttachmentRow = typeof jobAttachments.$inferSelect;
export type JobAttachmentInsert = typeof jobAttachments.$inferInsert;
