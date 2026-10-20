import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { jobs } from "./jobs";
import { users } from "./users";

export const APPRECIATION_CATEGORIES = [
  "first_time_right",
  "clean_drawing",
  "fast_turnaround",
  "client_praise",
  "helped_teammate",
  "other",
] as const;

export type AppreciationCategory = (typeof APPRECIATION_CATEGORIES)[number];

export const APPRECIATION_LEVELS = ["good", "great", "outstanding"] as const;
export type AppreciationLevel = (typeof APPRECIATION_LEVELS)[number];

export const appreciations = pgTable(
  "appreciations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdById: uuid("created_by_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull().default("other"),
    level: text("level").notNull().default("good"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("appreciations_job_idx").on(t.jobId),
    index("appreciations_user_idx").on(t.userId),
    index("appreciations_created_by_idx").on(t.createdById),
    index("appreciations_category_idx").on(t.category),
    index("appreciations_level_idx").on(t.level),
  ],
);

export type AppreciationRow = typeof appreciations.$inferSelect;
export type AppreciationInsert = typeof appreciations.$inferInsert;
