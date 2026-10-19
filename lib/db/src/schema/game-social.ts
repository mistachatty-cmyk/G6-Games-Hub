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

export const kineticSoulsSettingsTable = pgTable(
  "kinetic_souls_settings",
  {
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    gameSlug: varchar("game_slug", { length: 120 }).notNull(),
    modelStyle: varchar("model_style", { length: 16 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("kinetic_souls_settings_user_game_idx").on(table.userId, table.gameSlug),
    index("kinetic_souls_settings_game_slug_idx").on(table.gameSlug),
  ],
);

export const kineticSoulsMatchResultsTable = pgTable(
  "kinetic_souls_match_results",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    gameSlug: varchar("game_slug", { length: 120 }).notNull(),
    sessionId: varchar("session_id", { length: 36 }).notNull(),
    mode: varchar("mode", { length: 24 }).notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    score: integer("score").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("kinetic_souls_results_user_game_session_idx").on(table.userId, table.gameSlug, table.sessionId),
    index("kinetic_souls_results_game_mode_score_idx").on(table.gameSlug, table.mode, table.score),
    index("kinetic_souls_results_game_mode_created_idx").on(table.gameSlug, table.mode, table.createdAt),
  ],
);

export type GameStar = typeof gameStarsTable.$inferSelect;
export type Feedback = typeof feedbackTable.$inferSelect;
export type KineticSoulsSettings = typeof kineticSoulsSettingsTable.$inferSelect;
export type KineticSoulsMatchResult = typeof kineticSoulsMatchResultsTable.$inferSelect;
