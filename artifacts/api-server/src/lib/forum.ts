import type { AuthUser } from "@workspace/api-zod";
import { forumActivityEventsTable, forumCategoriesTable, forumRepliesTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { invalidateLeaderboardCache } from "./leaderboard";

export const FORUM_CATEGORIES = [
  {
    slug: "game-room",
    name: "Game Room",
    description: "Talk about the games, puzzles, and worlds behind each door.",
    sortOrder: 10,
  },
  {
    slug: "field-notes",
    name: "Field Notes",
    description: "Share discoveries, recommendations, and things worth keeping open.",
    sortOrder: 20,
  },
  {
    slug: "lounge",
    name: "Lounge",
    description: "A low-pressure corner for introductions and conversations.",
    sortOrder: 30,
  },
] as const;

export const FORUM_EDIT_WINDOW_MS = 30 * 60 * 1000;
const rateLimitBuckets = new Map<string, number[]>();

export function cleanForumText(value: string): string {
  return value.replace(/\u0000/g, "").trim();
}

export function forumExcerpt(value: string, maxLength = 180): string {
  const clean = cleanForumText(value).replace(/\s+/g, " ");
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean;
}

export function isWithinForumEditWindow(createdAt: Date): boolean {
  return Date.now() - createdAt.getTime() <= FORUM_EDIT_WINDOW_MS;
}

export function canModerate(role: string | null | undefined): boolean {
  return role === "moderator" || role === "admin" || role === "owner";
}

export function rateLimitForumAction(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const existing = rateLimitBuckets.get(key) ?? [];
  const recent = existing.filter((timestamp) => now - timestamp < windowMs);
  if (recent.length >= limit) {
    const oldest = recent[0] ?? now;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)),
    };
  }
  recent.push(now);
  rateLimitBuckets.set(key, recent);
  return { allowed: true, retryAfterSeconds: 0 };
}

export async function ensureForumCategories(db: typeof import("@workspace/db").db) {
  await db
    .insert(forumCategoriesTable)
    .values([...FORUM_CATEGORIES])
    .onConflictDoNothing({ target: forumCategoriesTable.slug });
  return db.select().from(forumCategoriesTable).orderBy(forumCategoriesTable.sortOrder);
}

export async function approveForumActivity(
  db: typeof import("@workspace/db").db,
  target: { threadId?: number; replyId?: number },
  isApproved: boolean,
) {
  if (target.threadId != null) {
    await db
      .update(forumActivityEventsTable)
      .set({ isApproved: false })
      .where(eq(forumActivityEventsTable.threadId, target.threadId));
    if (!isApproved) {
      invalidateLeaderboardCache();
      return;
    }
    await db
      .update(forumActivityEventsTable)
      .set({ isApproved: true })
      .where(and(eq(forumActivityEventsTable.threadId, target.threadId), eq(forumActivityEventsTable.eventType, "thread_created")));
    const publishedReplies = await db
      .select({ id: forumRepliesTable.id })
      .from(forumRepliesTable)
      .where(and(eq(forumRepliesTable.threadId, target.threadId), eq(forumRepliesTable.status, "published")));
    if (publishedReplies.length) {
      await db
        .update(forumActivityEventsTable)
        .set({ isApproved: true })
        .where(inArray(forumActivityEventsTable.replyId, publishedReplies.map((reply) => reply.id)));
    }
    invalidateLeaderboardCache();
    return;
  }
  if (target.replyId != null) {
    await db
      .update(forumActivityEventsTable)
      .set({ isApproved })
      .where(eq(forumActivityEventsTable.replyId, target.replyId));
    invalidateLeaderboardCache();
  }
}

export function publicViewer(user: AuthUser | null | undefined): string | undefined {
  return user?.id;
}