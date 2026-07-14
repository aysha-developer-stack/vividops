import { pgTable, uuid, text, timestamp, integer, pgEnum, index } from "drizzle-orm/pg-core";
import { jobs } from "./jobs";
import { users } from "./users";

export const errorSeverityEnum = pgEnum("error_severity", ["low", "medium", "high"]);
export const errorReportStatusEnum = pgEnum("error_report_status", ["open", "resolved"]);

export const MISTAKE_CATEGORIES = [
  "drawing_error",
  "measurement_error",
  "missing_info",
  "calculation_error",
  "quality_issue",
  "deadline_missed",
  "process_not_followed",
  "rework",
  "other",
] as const;

export type MistakeCategory = (typeof MISTAKE_CATEGORIES)[number];

export const errorReports = pgTable(
  "error_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdById: uuid("created_by_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull().default("other"),
    checklistItemId: integer("checklist_item_id"),
    source: text("source").notNull().default("manual"),
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
    index("error_reports_category_idx").on(t.category),
  ],
);

export type ErrorReportRow = typeof errorReports.$inferSelect;
export type ErrorReportInsert = typeof errorReports.$inferInsert;
