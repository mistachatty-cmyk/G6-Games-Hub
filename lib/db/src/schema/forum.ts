import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  index,
  varchar,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const forumCategoriesTable = pgTable(
  "forum_categories",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    slug: varchar("slug", { length: 48 }).notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    description: text("description").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("forum_categories_slug_idx").on(table.slug),
    index("forum_categories_sort_order_idx").on(table.sortOrder),
  ],
);

export const forumThreadsTable = pgTable(
  "forum_threads",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => forumCategoriesTable.id, { onDelete: "cascade" }),
    authorUserId: varchar("author_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 120 }).notNull(),
    content: text("content").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("published"),
    isLocked: boolean("is_locked").notNull().default(false),
    isPinned: boolean("is_pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("forum_threads_category_activity_idx").on(table.categoryId, table.lastActivityAt),
    index("forum_threads_status_activity_idx").on(table.status, table.lastActivityAt),
    index("forum_threads_author_idx").on(table.authorUserId),
  ],
);

export const forumRepliesTable = pgTable(
  "forum_replies",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    threadId: integer("thread_id")
      .notNull()
      .references(() => forumThreadsTable.id, { onDelete: "cascade" }),
    authorUserId: varchar("author_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("published"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("forum_replies_thread_created_idx").on(table.threadId, table.createdAt),
    index("forum_replies_status_created_idx").on(table.status, table.createdAt),
    index("forum_replies_author_idx").on(table.authorUserId),
  ],
);

export const forumReportsTable = pgTable(
  "forum_reports",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    reporterUserId: varchar("reporter_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    threadId: integer("thread_id").references(() => forumThreadsTable.id, { onDelete: "cascade" }),
    replyId: integer("reply_id").references(() => forumRepliesTable.id, { onDelete: "cascade" }),
    reason: varchar("reason", { length: 500 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    resolvedBy: varchar("resolved_by").references(() => usersTable.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("forum_reports_status_created_idx").on(table.status, table.createdAt),
    index("forum_reports_reporter_idx").on(table.reporterUserId),
  ],
);

export const forumModerationAuditTable = pgTable(
  "forum_moderation_audit",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    actorUserId: varchar("actor_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    threadId: integer("thread_id").references(() => forumThreadsTable.id, { onDelete: "set null" }),
    replyId: integer("reply_id").references(() => forumRepliesTable.id, { onDelete: "set null" }),
    action: varchar("action", { length: 32 }).notNull(),
    reason: varchar("reason", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("forum_audit_thread_created_idx").on(table.threadId, table.createdAt),
    index("forum_audit_reply_created_idx").on(table.replyId, table.createdAt),
    index("forum_audit_actor_created_idx").on(table.actorUserId, table.createdAt),
  ],
);

export const forumActivityEventsTable = pgTable(
  "forum_activity_events",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    eventType: varchar("event_type", { length: 32 }).notNull(),
    isApproved: boolean("is_approved").notNull().default(true),
    actorUserId: varchar("actor_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    categoryId: integer("category_id").references(() => forumCategoriesTable.id, { onDelete: "set null" }),
    threadId: integer("thread_id").references(() => forumThreadsTable.id, { onDelete: "set null" }),
    replyId: integer("reply_id").references(() => forumRepliesTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("forum_activity_event_created_idx").on(table.eventType, table.createdAt),
    index("forum_activity_actor_created_idx").on(table.actorUserId, table.createdAt),
    index("forum_activity_reply_idx").on(table.replyId),
  ],
);

export type ForumCategory = typeof forumCategoriesTable.$inferSelect;
export type ForumThread = typeof forumThreadsTable.$inferSelect;
export type ForumReply = typeof forumRepliesTable.$inferSelect;
export type ForumReport = typeof forumReportsTable.$inferSelect;
export type ForumModerationAudit = typeof forumModerationAuditTable.$inferSelect;
export type ForumActivityEvent = typeof forumActivityEventsTable.$inferSelect;