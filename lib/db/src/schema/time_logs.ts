import { pgTable, uuid, text, timestamp, index, integer } from "drizzle-orm/pg-core";
import { users } from "./users";
import { jobs } from "./jobs";

export const timeLogs = pgTable("time_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
  task: text("task").notNull(),
  duration: integer("duration").notNull(), // duration in seconds
  startTime: timestamp("start_time", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("time_logs_user_idx").on(t.userId),
  index("time_logs_job_idx").on(t.jobId),
]);

export type TimeLogRow = typeof timeLogs.$inferSelect;
export type TimeLogInsert = typeof timeLogs.$inferInsert;
