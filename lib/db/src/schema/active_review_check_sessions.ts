import { pgTable, uuid, timestamp, index, integer } from "drizzle-orm/pg-core";
import { users } from "./users";
import { jobs } from "./jobs";

export const activeReviewCheckSessions = pgTable(
  "active_review_check_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supervisorId: uuid("supervisor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
      .unique(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    accumulatedSeconds: integer("accumulated_seconds").notNull().default(0),
    segmentStartedAt: timestamp("segment_started_at", { withTimezone: true }),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("active_review_check_sessions_job_idx").on(t.jobId),
    index("active_review_check_sessions_heartbeat_idx").on(t.lastHeartbeatAt),
  ],
);

export type ActiveReviewCheckSessionRow = typeof activeReviewCheckSessions.$inferSelect;
export type ActiveReviewCheckSessionInsert = typeof activeReviewCheckSessions.$inferInsert;
