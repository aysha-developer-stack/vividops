import { pgTable, uuid, text, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { jobs } from "./jobs";
import { users } from "./users";

export const errorSeverityEnum = pgEnum("error_severity", ["low", "medium", "high"]);
export const errorReportStatusEnum = pgEnum("error_report_status", ["open", "resolved"]);

export const errorReports = pgTable(
  "error_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdById: uuid("created_by_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    severity: errorSeverityEnum("severity").notNull().default("medium"),
    status: errorReportStatusEnum("status").notNull().default("open"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("error_reports_job_idx").on(t.jobId),
    index("error_reports_user_idx").on(t.userId),
    index("error_reports_created_by_idx").on(t.createdById),
    index("error_reports_status_idx").on(t.status),
    index("error_reports_severity_idx").on(t.severity),
  ],
);

export type ErrorReportRow = typeof errorReports.$inferSelect;
export type ErrorReportInsert = typeof errorReports.$inferInsert;
