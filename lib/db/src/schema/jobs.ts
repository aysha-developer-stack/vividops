import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  pgEnum,
  serial,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const jobPriorityEnum = pgEnum("job_priority", ["low", "medium", "high"]);

export const jobStatusEnum = pgEnum("job_status", [
  "pending",
  "in_progress",
  "completed",
  "cancelled",
  "rework",
]);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serial: serial("serial").notNull().unique(),
    title: text("title").notNull(),
    client: text("client").notNull(),
    address: text("address"),
    description: text("description"),
    priority: jobPriorityEnum("priority").notNull().default("medium"),
    status: jobStatusEnum("status").notNull().default("pending"),
    assigneeId: uuid("assignee_id").references(() => users.id, {
      onDelete: "set null",
    }),
    supervisorId: uuid("supervisor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdById: uuid("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    progress: integer("progress").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("jobs_assignee_idx").on(t.assigneeId),
    index("jobs_supervisor_idx").on(t.supervisorId),
    index("jobs_status_idx").on(t.status),
  ],
);

export type JobRow = typeof jobs.$inferSelect;
export type JobInsert = typeof jobs.$inferInsert;
