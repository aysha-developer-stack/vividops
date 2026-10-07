import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

export const builderSpecs = pgTable(
  "builder_specs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    builderName: text("builder_name").notNull(),
    builderKey: text("builder_key").notNull(),
    body: text("body").notNull(),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("builder_specs_builder_key_uniq").on(t.builderKey),
    index("builder_specs_name_idx").on(t.builderName),
  ],
);

export type BuilderSpecRow = typeof builderSpecs.$inferSelect;
export type BuilderSpecInsert = typeof builderSpecs.$inferInsert;
