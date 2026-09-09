import { pgTable, uuid, text, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { users } from "./users";

export const userSectionReadState = pgTable(
  "user_section_read_state",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    section: text("section").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.section] })],
);

export type UserSectionReadStateRow = typeof userSectionReadState.$inferSelect;
