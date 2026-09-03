import type { AuthUser } from "@workspace/api-zod";
import {
  db,
  memberProfilesTable,
  memberRolesTable,
  type User,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { isGsixOwner } from "./ownership";

export const MEMBER_ROLES = ["member", "moderator", "admin", "owner"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const BADGE_CATALOG = [
  {
    slug: "lok-clone",
    name: "Lok Clone",
    description: "The default signal for every new member.",
    isDefault: true,
    isSelectable: true,
  },
  {
    slug: "lok-knight",
    name: "Lok Knight",
    description: "A steady defender of the strange and useful.",
    isDefault: false,
    isSelectable: true,
  },
  {
    slug: "lokness-monster",
    name: "Lokness Monster",
    description: "A legendary presence beneath the surface.",
    isDefault: false,
    isSelectable: true,
  },
  {
    slug: "lok-clown",
    name: "Lok Clown",
    description: "A little chaos keeps the network awake.",
    isDefault: false,
    isSelectable: true,
  },
  {
    slug: "lok-loner",
    name: "Lok Loner",
    description: "Quiet signal, sharp observations.",
    isDefault: false,
    isSelectable: true,
  },
  {
    slug: "lok-lit",
    name: "Lok Lit",
    description: "Bright ideas for dark tabs.",
    isDefault: false,
    isSelectable: true,
  },
] as const;

export type BadgeSlug = (typeof BADGE_CATALOG)[number]["slug"];

export const DISPLAY_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _-]{1,23}$/;

export function getBadge(slug: string) {
  return BADGE_CATALOG.find((badge) => badge.slug === slug);
}

export function isMemberRole(value: string): value is MemberRole {
  return MEMBER_ROLES.includes(value as MemberRole);
}

export function roleForUser(
  user: Pick<AuthUser, "id" | "email">,
  storedRole?: string | null,
): MemberRole {
  if (isGsixOwner(user as AuthUser)) return "owner";
  return storedRole && isMemberRole(storedRole) ? storedRole : "member";
}

export function fallbackDisplayName(user: Pick<User, "id" | "firstName" | "lastName" | "email">) {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (fullName && DISPLAY_NAME_PATTERN.test(fullName)) return fullName;
  const localPart = user.email?.split("@")[0]?.replace(/[^A-Za-z0-9 _-]/g, "").trim();
  if (localPart && DISPLAY_NAME_PATTERN.test(localPart)) return localPart;
  return `Lok Player ${user.id.slice(-6)}`;
}

export async function ensureMemberProfile(user: User) {
  const [existing] = await db
    .select()
    .from(memberProfilesTable)
    .where(eq(memberProfilesTable.userId, user.id));
  if (existing) return existing;

  const preferredName = fallbackDisplayName(user);
  const [sameName] = await db
    .select({ userId: memberProfilesTable.userId })
    .from(memberProfilesTable)
    .where(eq(memberProfilesTable.displayName, preferredName));
  const displayName = sameName ? `Lok Player ${user.id.slice(-6)}` : preferredName;

  const [created] = await db
    .insert(memberProfilesTable)
    .values({
      userId: user.id,
      displayName,
      badgeSlug: "lok-clone",
      starterTag: "lok-clone",
      earnedBadges: ["lok-clone"],
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  const [retried] = await db
    .select()
    .from(memberProfilesTable)
    .where(eq(memberProfilesTable.userId, user.id));
  if (!retried) throw new Error("Member profile could not be created.");
  return retried;
}

export async function getStoredRole(userId: string) {
  const [role] = await db
    .select({ role: memberRolesTable.role })
    .from(memberRolesTable)
    .where(eq(memberRolesTable.userId, userId));
  return role?.role ?? null;
}