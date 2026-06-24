import { pgTable, uuid, text, timestamp, index, boolean } from "drizzle-orm/pg-core";
import { users } from "./users";
import { jobs } from "./jobs";

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  type: text("type").notNull(), // assigned, updated, overdue, timer, rework, etc.
  channel: text("channel").notNull().default("in_app"), // in_app, email, cliq, push
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at", { withTimezone: true }),
  deliveryStatus: text("delivery_status").notNull().default("sent"), // sent, failed, pending
  escalationStatus: text("escalation_status").notNull().default("none"), // none, escalated
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("notifications_user_idx").on(t.userId),
  index("notifications_job_idx").on(t.jobId),
]);

export type NotificationRow = typeof notifications.$inferSelect;
export type NotificationInsert = typeof notifications.$inferInsert;
