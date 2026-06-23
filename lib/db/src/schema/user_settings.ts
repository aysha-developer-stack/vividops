import {
  pgTable,
  uuid,
  boolean,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  
  // Notifications
  emailNotifications: boolean("email_notifications").notNull().default(true),
  pushNotifications: boolean("push_notifications").notNull().default(true),
  smsNotifications: boolean("sms_notifications").notNull().default(false),
  weeklyDigest: boolean("weekly_digest").notNull().default(true),
  mentions: boolean("mentions").notNull().default(true),

  // Security
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  
  // Appearance
  theme: text("theme").notNull().default("light"), // light, dark, system
  accentColor: text("accent_color").notNull().default("#0B7EB9"),
  compactMode: boolean("compact_mode").notNull().default(false),
  
  // Regional
  language: text("language").notNull().default("English (US)"),
  timezone: text("timezone").notNull().default("UTC"),
  dateFormat: text("date_format").notNull().default("MM/DD/YYYY"),
  currency: text("currency").notNull().default("USD ($)"),
  
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
