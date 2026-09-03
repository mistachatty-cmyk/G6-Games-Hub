import {
  GetLeaderboardDiagnosticsResponse,
  GetLeaderboardQueryParams,
  GetLeaderboardResponse,
  RecordLeaderboardActivityBody,
  RecordLeaderboardActivityResponse,
} from "@workspace/api-zod";
import {
  db,
  forumActivityEventsTable,
  gameStarsTable,
  memberActivityDailyTable,
  memberProfilesTable,
} from "@workspace/db";
import { and, eq, gte, inArray } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { recordMemberActivity, LEADERBOARD_CACHE_TTL_MS, LEADERBOARD_SCORING, leaderboardWindowStart, scoreEngagedMinutes, utcActivityDate, type LeaderboardWindow } from "../lib/leaderboard";
import { canModerate } from "../lib/forum";
import { getBadge, getStoredRole, roleForUser } from "../lib/members";

const router: IRouter = Router();
const MAX_ENTRIES = 100;

type MetricAccumulator = {
  userId: string;
  forumThreads: number;
  approvedReplies: number;
  gameStars: number;
  returnDays: Set<string>;
  engagedMinutes: number;
  usefulReactions: number;
  acceptedAnswers: number;
  verifiedKills: number;
  verifiedSessions: number;
  crossAppAchievements: number;
};

type CachedLeaderboard = {
  generatedAt: Date;
  entries: Array<{
    userId: string;
    displayName: string;
    badge: ReturnType<typeof getBadge> extends infer T ? NonNullable<T> : never;
    rank: number;
    score: number;
    metrics: Array<{ key: string; label: string; value: number; points: number; enabled: boolean }>;
  }>;
};

const cache = new Map<LeaderboardWindow, { expiresAt: number; value: CachedLeaderboard }>();

function moderatorOnly(req: Request, res: Response): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Sign in to access leaderboard diagnostics." });
    return false;
  }
  return true;
}

function authRequired(req: Request, res: Response): boolean {
  if (req.isAuthenticated()) return true;
  res.status(401).json({ error: "Sign in to record activity." });
  return false;
}

function emptyAccumulator(userId: string): MetricAccumulator {
  return {
    userId,
    forumThreads: 0,
    approvedReplies: 0,
    gameStars: 0,
    returnDays: new Set<string>(),
    engagedMinutes: 0,
    usefulReactions: 0,
    acceptedAnswers: 0,
    verifiedKills: 0,
    verifiedSessions: 0,
    crossAppAchievements: 0,
  };
}

function ensureAccumulator(map: Map<string, MetricAccumulator>, userId: string) {
  const existing = map.get(userId);
  if (existing) return existing;
  const created = emptyAccumulator(userId);
  map.set(userId, created);
  return created;
}

function dayFromDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function scoringRules() {
  return [
    { key: "forumThreads", label: "Published threads", points: LEADERBOARD_SCORING.forumThread, dailyCap: null, enabled: true, description: "A public thread that remains approved." },
    { key: "approvedReplies", label: "Approved replies", points: LEADERBOARD_SCORING.approvedReply, dailyCap: null, enabled: true, description: "Helpful replies that are still visible and approved." },
    { key: "gameStars", label: "Game stars", points: LEADERBOARD_SCORING.gameStar, dailyCap: null, enabled: true, description: "One star per game, attributed only when you are signed in." },
    { key: "returnDays", label: "Return days", points: LEADERBOARD_SCORING.returnDay, dailyCap: null, enabled: true, description: "Distinct active days, with no raw timeline exposed." },
    { key: "engagedMinutes", label: "Engaged time", points: LEADERBOARD_SCORING.engagedTenMinutes, dailyCap: 120, enabled: true, description: "One point per 10 visible, engaged minutes, capped daily." },
    { key: "usefulReactions", label: "Useful reactions", points: 1, dailyCap: null, enabled: false, description: "Reserved until a reaction system is enabled." },
    { key: "acceptedAnswers", label: "Accepted answers", points: 8, dailyCap: null, enabled: false, description: "Reserved until answer acceptance is enabled." },
    { key: "verifiedKills", label: "Verified kills", points: 0, dailyCap: null, enabled: false, description: "Reserved for authenticated game events." },
    { key: "verifiedSessions", label: "Verified game sessions", points: 0, dailyCap: null, enabled: false, description: "Reserved for authenticated game events." },
    { key: "crossAppAchievements", label: "Cross-app achievements", points: 0, dailyCap: null, enabled: false, description: "Reserved for versioned Lok Ecosystem events." },
  ];
}

async function buildLeaderboard(window: LeaderboardWindow): Promise<CachedLeaderboard> {
  const start = leaderboardWindowStart(window);
  const eventWhere = start
    ? and(eq(forumActivityEventsTable.isApproved, true), gte(forumActivityEventsTable.createdAt, start))
    : eq(forumActivityEventsTable.isApproved, true);
  const starWhere = start ? gte(gameStarsTable.createdAt, start) : undefined;
  const activityWhere = start ? gte(memberActivityDailyTable.activityDate, utcActivityDate(start)) : undefined;

  const [events, stars, activity] = await Promise.all([
    db.select({
      userId: forumActivityEventsTable.actorUserId,
      eventType: forumActivityEventsTable.eventType,
      createdAt: forumActivityEventsTable.createdAt,
    }).from(forumActivityEventsTable).where(eventWhere),
    db.select({
      userId: gameStarsTable.memberUserId,
      createdAt: gameStarsTable.createdAt,
    }).from(gameStarsTable).where(starWhere),
    db.select({
      userId: memberActivityDailyTable.userId,
      activityDate: memberActivityDailyTable.activityDate,
      engagedMinutes: memberActivityDailyTable.engagedMinutes,
    }).from(memberActivityDailyTable).where(activityWhere),
  ]);

  const accumulators = new Map<string, MetricAccumulator>();
  for (const event of events) {
    const row = ensureAccumulator(accumulators, event.userId);
    if (event.eventType === "thread_created") row.forumThreads += 1;
    if (event.eventType === "reply_created") row.approvedReplies += 1;
    row.returnDays.add(dayFromDate(event.createdAt));
  }
  for (const star of stars) {
    if (!star.userId) continue;
    const row = ensureAccumulator(accumulators, star.userId);
    row.gameStars += 1;
    row.returnDays.add(dayFromDate(star.createdAt));
  }
  for (const day of activity) {
    const row = ensureAccumulator(accumulators, day.userId);
    row.engagedMinutes += Math.min(120, Math.max(0, day.engagedMinutes));
    row.returnDays.add(day.activityDate);
  }

  const userIds = [...accumulators.keys()];
  if (!userIds.length) return { generatedAt: new Date(), entries: [] };
  const profiles = await db.select().from(memberProfilesTable).where(inArray(memberProfilesTable.userId, userIds));
  const profileMap = new Map(profiles.map((profile) => [profile.userId, profile]));
  const entries = [...accumulators.values()].flatMap((row) => {
    const profile = profileMap.get(row.userId);
    if (!profile) return [];
    const metrics = [
      { key: "forumThreads", label: "Threads", value: row.forumThreads, points: row.forumThreads * LEADERBOARD_SCORING.forumThread, enabled: true },
      { key: "approvedReplies", label: "Approved replies", value: row.approvedReplies, points: row.approvedReplies * LEADERBOARD_SCORING.approvedReply, enabled: true },
      { key: "gameStars", label: "Game stars", value: row.gameStars, points: row.gameStars * LEADERBOARD_SCORING.gameStar, enabled: true },
      { key: "returnDays", label: "Return days", value: row.returnDays.size, points: row.returnDays.size * LEADERBOARD_SCORING.returnDay, enabled: true },
      { key: "engagedMinutes", label: "Engaged minutes", value: row.engagedMinutes, points: scoreEngagedMinutes(row.engagedMinutes), enabled: true },
      { key: "usefulReactions", label: "Useful reactions", value: row.usefulReactions, points: 0, enabled: false },
      { key: "acceptedAnswers", label: "Accepted answers", value: row.acceptedAnswers, points: 0, enabled: false },
      { key: "verifiedKills", label: "Verified kills", value: row.verifiedKills, points: 0, enabled: false },
      { key: "verifiedSessions", label: "Verified game sessions", value: row.verifiedSessions, points: 0, enabled: false },
      { key: "crossAppAchievements", label: "Cross-app achievements", value: row.crossAppAchievements, points: 0, enabled: false },
    ];
    return [{
      userId: profile.userId,
      displayName: profile.displayName,
      badge: getBadge(profile.badgeSlug) ?? getBadge("lok-clone")!,
      rank: 0,
      score: metrics.reduce((total, metric) => total + metric.points, 0),
      metrics,
    }];
  });
  entries.sort((left, right) => right.score - left.score || left.displayName.localeCompare(right.displayName));
  let previousScore: number | undefined;
  let previousRank = 0;
  entries.forEach((entry, index) => {
    entry.rank = entry.score === previousScore ? previousRank : index + 1;
    previousScore = entry.score;
    previousRank = entry.rank;
  });
  return { generatedAt: new Date(), entries: entries.slice(0, MAX_ENTRIES) };
}

async function getCachedLeaderboard(window: LeaderboardWindow) {
  const current = cache.get(window);
  if (current && current.expiresAt > Date.now()) return current.value;
  const value = await buildLeaderboard(window);
  cache.set(window, { value, expiresAt: Date.now() + LEADERBOARD_CACHE_TTL_MS });
  return value;
}

router.get("/leaderboard", async (req, res): Promise<void> => {
  const query = GetLeaderboardQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Choose weekly, monthly, or all-time rankings." });
    return;
  }
  const window = query.data.window as LeaderboardWindow;
  const value = await getCachedLeaderboard(window);
  const viewerRank = req.isAuthenticated()
    ? value.entries.find((entry) => entry.userId === req.user.id)?.rank ?? null
    : null;
  res.json(GetLeaderboardResponse.parse({
    window,
    generatedAt: value.generatedAt,
    refreshAfterSeconds: LEADERBOARD_CACHE_TTL_MS / 1000,
    scoring: scoringRules(),
    entries: value.entries.slice(0, MAX_ENTRIES),
    viewerRank,
  }));
});

router.post("/leaderboard/activity", async (req, res): Promise<void> => {
  if (!authRequired(req, res)) return;
  const body = RecordLeaderboardActivityBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Activity pulses must be between 1 and 5 engaged minutes." });
    return;
  }
  await recordMemberActivity(req.user!.id, body.data.engagedMinutes);
  cache.clear();
  res.json(RecordLeaderboardActivityResponse.parse({ recorded: true, dailyCapMinutes: 120 }));
});

router.get("/leaderboard/moderation/diagnostics", async (req, res): Promise<void> => {
  if (!moderatorOnly(req, res)) return;
  const role = roleForUser(req.user!, await getStoredRole(req.user!.id));
  if (!canModerate(role)) {
    res.status(403).json({ error: "Moderator access is required." });
    return;
  }
  const allTime = await getCachedLeaderboard("all-time");
  const daily = await db.select({ engagedMinutes: memberActivityDailyTable.engagedMinutes }).from(memberActivityDailyTable);
  const overCapRecords = daily.filter((row) => row.engagedMinutes > 120).length;
  const anomalies = overCapRecords
    ? [`${overCapRecords} daily activity record${overCapRecords === 1 ? "" : "s"} exceed the server cap.`]
    : ["No aggregate anomalies detected."];
  res.json(GetLeaderboardDiagnosticsResponse.parse({
    generatedAt: allTime.generatedAt,
    cachedWindows: [...cache.keys()],
    rankedMembers: allTime.entries.length,
    cappedDailyMinutes: daily.reduce((sum, row) => sum + Math.min(120, Math.max(0, row.engagedMinutes)), 0),
    futureEventSources: ["verified-kills", "verified-game-sessions", "lok-ecosystem-achievements"],
    anomalies,
  }));
});

export default router;