import { pgTable, uuid, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { jobs } from "./jobs";
import { builderSpecs } from "./builder_specs";

export const jobBuilderSpecs = pgTable(
  "job_builder_specs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    builderName: text("builder_name").notNull(),
    builderKey: text("builder_key").notNull(),
    body: text("body").notNull(),
    sourceSpecId: uuid("source_spec_id").references(() => builderSpecs.id, { onDelete: "set null" }),
    copiedAt: timestamp("copied_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("job_builder_specs_job_uniq").on(t.jobId),
    index("job_builder_specs_key_idx").on(t.builderKey),
  ],
);

export type JobBuilderSpecRow = typeof jobBuilderSpecs.$inferSelect;
export type JobBuilderSpecInsert = typeof jobBuilderSpecs.$inferInsert;
