import { pgTable, uuid, text, timestamp, index, integer } from "drizzle-orm/pg-core";
import { users } from "./users";
import { jobs } from "./jobs";

export const activeTimerSessions = pgTable(
  "active_timer_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
      .unique(),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    task: text("task").notNull(),
    accumulatedSeconds: integer("accumulated_seconds").notNull().default(0),
    segmentStartedAt: timestamp("segment_started_at", { withTimezone: true }),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("active_timer_sessions_job_idx").on(t.jobId),
    index("active_timer_sessions_heartbeat_idx").on(t.lastHeartbeatAt),
  ],
);

export type ActiveTimerSessionRow = typeof activeTimerSessions.$inferSelect;
export type ActiveTimerSessionInsert = typeof activeTimerSessions.$inferInsert;
