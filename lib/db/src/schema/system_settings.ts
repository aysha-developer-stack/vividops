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
  
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
