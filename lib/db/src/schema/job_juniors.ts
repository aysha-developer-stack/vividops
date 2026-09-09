import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { jobs } from "./jobs";
import { users } from "./users";

export const jobJuniors = pgTable(
  "job_juniors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: text("status").notNull().default("not_started"),
    loggedSeconds: integer("logged_seconds").notNull().default(0),
    segmentStartedAt: timestamp("segment_started_at", { withTimezone: true }),
    addedById: uuid("added_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("job_juniors_job_idx").on(t.jobId),
    index("job_juniors_added_by_idx").on(t.addedById),
  ],
);

export type JobJuniorRow = typeof jobJuniors.$inferSelect;
export type JobJuniorInsert = typeof jobJuniors.$inferInsert;
