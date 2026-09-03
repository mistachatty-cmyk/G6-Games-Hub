import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const authIdentitiesTable = pgTable(
  "auth_identities",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    provider: varchar("provider", { length: 32 }).notNull(),
    subject: varchar("subject", { length: 255 }).notNull(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("auth_identities_provider_subject_idx").on(
      table.provider,
      table.subject,
    ),
    index("auth_identities_user_id_idx").on(table.userId),
  ],
);

export const memberProfilesTable = pgTable(
  "member_profiles",
  {
    userId: varchar("user_id")
      .primaryKey()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    displayName: varchar("display_name", { length: 32 }).notNull(),
    badgeSlug: varchar("badge_slug", { length: 64 })
      .notNull()
      .default("lok-clone"),
    starterTag: varchar("starter_tag", { length: 64 })
      .notNull()
      .default("lok-clone"),
    earnedBadges: jsonb("earned_badges")
      .$type<string[]>()
      .notNull()
      .default(sql`'["lok-clone"]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("member_profiles_display_name_idx").on(table.displayName)],
);

export const memberRolesTable = pgTable(
  "member_roles",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 24 }).notNull().default("member"),
    grantedBy: varchar("granted_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("member_roles_user_id_idx").on(table.userId),
    index("member_roles_role_idx").on(table.role),
  ],
);

export const memberRoleAuditTable = pgTable(
  "member_role_audit",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    actorUserId: varchar("actor_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    previousRole: varchar("previous_role", { length: 24 }),
    nextRole: varchar("next_role", { length: 24 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("member_role_audit_user_id_idx").on(table.userId),
    index("member_role_audit_actor_user_id_idx").on(table.actorUserId),
  ],
);

export type AuthIdentity = typeof authIdentitiesTable.$inferSelect;
export type MemberProfile = typeof memberProfilesTable.$inferSelect;
export type MemberRole = typeof memberRolesTable.$inferSelect;
export type MemberRoleAudit = typeof memberRoleAuditTable.$inferSelect;