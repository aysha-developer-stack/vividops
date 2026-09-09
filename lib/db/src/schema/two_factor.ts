import { pgTable, uuid, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { users } from "./users";

export const twoFactorChallenges = pgTable(
  "two_factor_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    pendingTotpSecret: text("pending_totp_secret"),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("two_factor_challenges_user_idx").on(t.userId),
    index("two_factor_challenges_expires_idx").on(t.expiresAt),
  ],
);

export const twoFactorTrustedDevices = pgTable(
  "two_factor_trusted_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("two_factor_trusted_devices_user_idx").on(t.userId),
    index("two_factor_trusted_devices_expires_idx").on(t.expiresAt),
  ],
);

export type TwoFactorChallengeRow = typeof twoFactorChallenges.$inferSelect;
export type TwoFactorTrustedDeviceRow = typeof twoFactorTrustedDevices.$inferSelect;
