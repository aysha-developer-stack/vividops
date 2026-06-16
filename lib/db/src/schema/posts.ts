import { pgTable, uuid, text, timestamp, index, pgEnum } from "drizzle-orm/pg-core";
import { users } from "./users";

export const postCategoryEnum = pgEnum("post_category", ["Onboarding", "Safety", "Technical", "Leadership"]);

export const posts = pgTable("posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  category: postCategoryEnum("category").notNull().default("Technical"),
  authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  attachments: text("attachments"), // JSON string of attachments for simplicity
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("posts_author_idx").on(t.authorId),
]);

export type PostRow = typeof posts.$inferSelect;
export type PostInsert = typeof posts.$inferInsert;
