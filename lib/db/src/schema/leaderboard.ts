import {
  date,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const memberActivityDailyTable = pgTable(
  "member_activity_daily",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    activityDate: date("activity_date").notNull(),
    engagedMinutes: integer("engaged_minutes").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("member_activity_daily_user_date_idx").on(table.userId, table.activityDate),
    index("member_activity_daily_date_idx").on(table.activityDate),
  ],
);

export type MemberActivityDaily = typeof memberActivityDailyTable.$inferSelect;