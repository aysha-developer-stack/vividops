import { pgTable, uuid, text, timestamp, index, uniqueIndex, integer, date } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

export const FREE_TIME_STATUSES = ["open", "detected", "submitted", "reviewed"] as const;
export type FreeTimeStatus = (typeof FREE_TIME_STATUSES)[number];

export const freeTimeReports = pgTable(
  "free_time_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdById: uuid("created_by_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    reportDate: date("report_date").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    workerNotes: text("worker_notes").notNull().default(""),
    supervisorNotes: text("supervisor_notes"),
    reviewedById: uuid("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    source: text("source").notNull().default("auto"),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("free_time_reports_user_idx").on(t.userId),
    index("free_time_reports_date_idx").on(t.reportDate),
    index("free_time_reports_status_idx").on(t.status),
    uniqueIndex("free_time_reports_open_user_idx").on(t.userId).where(sql`ended_at is null`),
  ],
);

export type FreeTimeReportRow = typeof freeTimeReports.$inferSelect;
export type FreeTimeReportInsert = typeof freeTimeReports.$inferInsert;
