import { index, integer, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const gameStarsTable = pgTable(
  "game_stars",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    gameSlug: varchar("game_slug", { length: 120 }).notNull(),
    voterKey: varchar("voter_key", { length: 64 }).notNull(),
    memberUserId: varchar("member_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("game_stars_game_voter_idx").on(table.gameSlug, table.voterKey),
    index("game_stars_game_slug_idx").on(table.gameSlug),
    index("game_stars_member_user_id_idx").on(table.memberUserId),
  ],
);

export const feedbackTable = pgTable(
  "game_feedback",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    gameSlug: varchar("game_slug", { length: 120 }).notNull(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("game_feedback_game_slug_idx").on(table.gameSlug),
    index("game_feedback_user_id_idx").on(table.userId),
  ],
);

export type GameStar = typeof gameStarsTable.$inferSelect;
export type Feedback = typeof feedbackTable.$inferSelect;