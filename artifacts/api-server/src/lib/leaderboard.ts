import { db, memberActivityDailyTable } from "@workspace/db";
import { sql } from "drizzle-orm";

export const LEADERBOARD_WINDOWS = ["weekly", "monthly", "all-time"] as const;
export type LeaderboardWindow = (typeof LEADERBOARD_WINDOWS)[number];
export const DAILY_ENGAGED_MINUTES_CAP = 120;
export const ACTIVITY_PULSE_MINUTES = 5;
export const LEADERBOARD_CACHE_TTL_MS = 60_000;
export const LEADERBOARD_FUTURE_EVENT_ADAPTER_VERSION = "v1";

let leaderboardCacheRevision = 0;

export function invalidateLeaderboardCache(): void {
  leaderboardCacheRevision += 1;
}

export function getLeaderboardCacheRevision(): number {
  return leaderboardCacheRevision;
}

export type FutureLeaderboardEvent = {
  version: typeof LEADERBOARD_FUTURE_EVENT_ADAPTER_VERSION;
  source: "verified-kills" | "verified-game-sessions" | "lok-ecosystem-achievements";
  userId: string;
  occurredAt: string;
  units: number;
};

export type FutureLeaderboardEventAdapter = {
  version: typeof LEADERBOARD_FUTURE_EVENT_ADAPTER_VERSION;
  source: FutureLeaderboardEvent["source"];
  normalize: (event: unknown) => FutureLeaderboardEvent | null;
};

export const LEADERBOARD_SCORING = {
  forumThread: 6,
  approvedReply: 4,
  gameStar: 2,
  returnDay: 3,
  engagedTenMinutes: 1,
} as const;

export function leaderboardWindowStart(window: LeaderboardWindow, now = new Date()): Date | undefined {
  if (window === "all-time") return undefined;
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - (window === "weekly" ? 6 : 29));
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

export function utcActivityDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function recordMemberActivity(userId: string, engagedMinutes = 0): Promise<void> {
  const minutes = Math.max(0, Math.min(DAILY_ENGAGED_MINUTES_CAP, Math.floor(engagedMinutes)));
  const activityDate = utcActivityDate();
  await db
    .insert(memberActivityDailyTable)
    .values({ userId, activityDate, engagedMinutes: minutes })
    .onConflictDoUpdate({
      target: [memberActivityDailyTable.userId, memberActivityDailyTable.activityDate],
      set: {
        engagedMinutes: sql`LEAST(${DAILY_ENGAGED_MINUTES_CAP}, ${memberActivityDailyTable.engagedMinutes} + ${minutes})`,
        updatedAt: new Date(),
      },
    });
  invalidateLeaderboardCache();
}

export function scoreEngagedMinutes(minutes: number): number {
  return Math.floor(Math.min(DAILY_ENGAGED_MINUTES_CAP, Math.max(0, minutes)) / 10) * LEADERBOARD_SCORING.engagedTenMinutes;
}

export function compareLeaderboardRows(
  left: { score: number; displayName: string },
  right: { score: number; displayName: string },
): number {
  return right.score - left.score || left.displayName.localeCompare(right.displayName);
}