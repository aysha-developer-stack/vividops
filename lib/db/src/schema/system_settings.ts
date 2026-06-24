import {
  pgTable,
  text,
  boolean,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";

export const systemSettings = pgTable("system_settings", {
  id: text("id").primaryKey().default("default"),
  autoBackup: boolean("auto_backup").notNull().default(true),
  maintenanceMode: boolean("maintenance_mode").notNull().default(false),
  apiLogging: boolean("api_logging").notNull().default(true),
  
  // Notification Admin Settings
  notifRetentionDays: integer("notif_retention_days").notNull().default(90),
  overdueEscalationDays: integer("overdue_escalation_days").notNull().default(7),
  reminderSchedule: text("reminder_schedule").notNull().default("3,1,0"), // Days before due date
  
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationTemplates = pgTable("notification_templates", {
  id: text("id").primaryKey(), // assigned, overdue, rework, etc.
  name: text("name").notNull(),
  emailSubject: text("email_subject"),
  emailBody: text("email_body"),
  cliqTemplate: text("cliq_template"),
  inAppTemplate: text("in_app_template"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
