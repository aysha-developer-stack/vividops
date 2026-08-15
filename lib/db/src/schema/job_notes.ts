import { pgTable, uuid, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { jobs } from "./jobs";
import { users } from "./users";

export const JOB_NOTE_TYPES = ["general", "site", "client", "internal", "completion"] as const;
export type JobNoteType = (typeof JOB_NOTE_TYPES)[number];

export const jobNotes = pgTable(
  "job_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    noteType: text("note_type").notNull().default("general"),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("job_notes_job_idx").on(t.jobId),
    index("job_notes_job_pinned_idx").on(t.jobId, t.pinned),
    index("job_notes_user_idx").on(t.userId),
  ],
);

export type JobNoteRow = typeof jobNotes.$inferSelect;
export type JobNoteInsert = typeof jobNotes.$inferInsert;
