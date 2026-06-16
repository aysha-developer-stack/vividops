import { pgTable, uuid, timestamp, index, unique } from "drizzle-orm/pg-core";
import { jobs } from "./jobs";
import { users } from "./users";

export const jobMembers = pgTable(
  "job_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("job_members_job_user_uniq").on(t.jobId, t.userId),
    index("job_members_job_idx").on(t.jobId),
    index("job_members_user_idx").on(t.userId),
  ],
);

export type JobMemberRow = typeof jobMembers.$inferSelect;
export type JobMemberInsert = typeof jobMembers.$inferInsert;
