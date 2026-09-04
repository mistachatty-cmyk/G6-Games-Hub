import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import app from "../app";
import { createSession } from "./auth";
import {
  DAILY_ENGAGED_MINUTES_CAP,
  invalidateLeaderboardCache,
  LEADERBOARD_SCORING,
  compareLeaderboardRows,
  leaderboardWindowStart,
  scoreEngagedMinutes,
  utcActivityDate,
} from "./leaderboard";
import {
  db,
  forumActivityEventsTable,
  gameStarsTable,
  memberActivityDailyTable,
  memberProfilesTable,
  pool,
  sessionsTable,
  usersTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";

type LeaderboardEntryPayload = {
  userId: string;
  displayName: string;
  badge: unknown;
  rank: number;
  score: number;
  metrics: Array<{ key: string; label: string; value: number; points: number; enabled: boolean }>;
};

type LeaderboardPayload = {
  window: string;
  generatedAt: string;
  entries: LeaderboardEntryPayload[];
  viewerRank: number | null;
};

type FixtureUser = { id: string; displayName: string };

let server: Server | undefined;
let baseUrl = "";
let fixtureSequence = 0;

test.before(async () => {
  const activeServer = createServer(app);
  server = activeServer;
  await new Promise<void>((resolve, reject) => {
    activeServer.once("error", reject);
    activeServer.listen(0, "127.0.0.1", resolve);
  });
  const address = activeServer.address();
  if (!address || typeof address === "string") throw new Error("Test server did not open a TCP address.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
  await pool.end();
});

function fixturePrefix(label: string): string {
  fixtureSequence += 1;
  return `leaderboard-${label}-${Date.now()}-${fixtureSequence}`;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function dateDaysAgo(days: number): string {
  return utcActivityDate(daysAgo(days));
}

async function insertFixtureUsers(users: FixtureUser[]): Promise<void> {
  await db.insert(usersTable).values(users.map((user) => ({
    id: user.id,
    email: `${user.id}@fixture.example`,
    firstName: "Ranking",
    lastName: "Fixture",
  })));
  await db.insert(memberProfilesTable).values(users.map((user) => ({
    userId: user.id,
    displayName: user.displayName,
  })));
}

async function cleanupFixture(users: FixtureUser[], sessionIds: string[] = []): Promise<void> {
  if (sessionIds.length) await db.delete(sessionsTable).where(inArray(sessionsTable.sid, sessionIds));
  await db.delete(usersTable).where(inArray(usersTable.id, users.map((user) => user.id)));
  invalidateLeaderboardCache();
}

async function getLeaderboard(window: "weekly" | "monthly" | "all-time", sessionId?: string): Promise<LeaderboardPayload> {
  const response = await fetch(`${baseUrl}/api/leaderboard?window=${window}`, {
    headers: sessionId ? { authorization: `Bearer ${sessionId}` } : undefined,
  });
  assert.equal(response.status, 200);
  return await response.json() as LeaderboardPayload;
}

function entryFor(payload: LeaderboardPayload, userId: string): LeaderboardEntryPayload {
  const entry = payload.entries.find((candidate) => candidate.userId === userId);
  assert.ok(entry, `Expected leaderboard entry for ${userId}`);
  return entry;
}

function metricFor(entry: LeaderboardEntryPayload, key: string) {
  const metric = entry.metrics.find((candidate) => candidate.key === key);
  assert.ok(metric, `Expected ${key} metric for ${entry.userId}`);
  return metric;
}

test("leaderboard windows use inclusive UTC calendar boundaries", () => {
  const now = new Date("2026-09-03T15:30:00.000Z");
  assert.equal(leaderboardWindowStart("weekly", now)?.toISOString(), "2026-08-28T00:00:00.000Z");
  assert.equal(leaderboardWindowStart("monthly", now)?.toISOString(), "2026-08-05T00:00:00.000Z");
  assert.equal(leaderboardWindowStart("all-time", now), undefined);
});

test("engaged time is capped and only full ten-minute blocks score", () => {
  assert.equal(scoreEngagedMinutes(9), 0);
  assert.equal(scoreEngagedMinutes(19), 1);
  assert.equal(scoreEngagedMinutes(DAILY_ENGAGED_MINUTES_CAP), 12);
  assert.equal(scoreEngagedMinutes(500), 12);
  assert.equal(LEADERBOARD_SCORING.engagedTenMinutes, 1);
});

test("activity dates are UTC dates without exposing a timeline", () => {
  assert.equal(utcActivityDate(new Date("2026-09-03T00:15:00.000Z")), "2026-09-03");
  assert.equal(utcActivityDate(new Date("2026-09-03T23:59:59.000Z")), "2026-09-03");
});

test("tied leaderboard scores sort deterministically by display name", () => {
  assert.equal(compareLeaderboardRows({ score: 10, displayName: "Zed" }, { score: 10, displayName: "Ada" }) > 0, true);
  assert.equal(compareLeaderboardRows({ score: 11, displayName: "Ada" }, { score: 10, displayName: "Zed" }) < 0, true);
});

test("database rankings aggregate approved forum events, member stars, and capped daily activity by window", async (t) => {
  const prefix = fixturePrefix("windows");
  const users = [
    { id: `${prefix}-weekly`, displayName: "Weekly Signal" },
    { id: `${prefix}-monthly`, displayName: "Monthly Signal" },
    { id: `${prefix}-old`, displayName: "All Time Signal" },
    { id: `${prefix}-unapproved`, displayName: "Unapproved Signal" },
    { id: `${prefix}-removed`, displayName: "Removed Signal" },
  ];
  await insertFixtureUsers(users);
  t.after(() => cleanupFixture(users));

  await db.insert(forumActivityEventsTable).values([
    { actorUserId: users[0].id, eventType: "thread_created", isApproved: true, createdAt: daysAgo(2) },
    { actorUserId: users[0].id, eventType: "reply_created", isApproved: true, createdAt: daysAgo(1) },
    { actorUserId: users[1].id, eventType: "thread_created", isApproved: true, createdAt: daysAgo(20) },
    { actorUserId: users[2].id, eventType: "thread_created", isApproved: true, createdAt: daysAgo(400) },
    { actorUserId: users[3].id, eventType: "reply_created", isApproved: false, createdAt: daysAgo(1) },
    { actorUserId: users[4].id, eventType: "thread_created", isApproved: true, createdAt: daysAgo(1) },
  ]);
  await db.insert(gameStarsTable).values([
    { gameSlug: "lokbook", voterKey: `${prefix}-weekly-star`, memberUserId: users[0].id, createdAt: daysAgo(1) },
    { gameSlug: "loklingu", voterKey: `${prefix}-monthly-star`, memberUserId: users[1].id, createdAt: daysAgo(20) },
    { gameSlug: "rune-diary", voterKey: `${prefix}-old-star`, memberUserId: users[2].id, createdAt: daysAgo(400) },
    { gameSlug: "lokbook", voterKey: `${prefix}-anonymous-star`, memberUserId: null, createdAt: daysAgo(1) },
  ]);
  await db.insert(memberActivityDailyTable).values([
    { userId: users[0].id, activityDate: dateDaysAgo(1), engagedMinutes: 240 },
    { userId: users[1].id, activityDate: dateDaysAgo(20), engagedMinutes: 30 },
    { userId: users[2].id, activityDate: dateDaysAgo(400), engagedMinutes: 20 },
  ]);
  invalidateLeaderboardCache();

  const weekly = await getLeaderboard("weekly");
  assert.equal(weekly.window, "weekly");
  const weeklyEntry = entryFor(weekly, users[0].id);
  assert.equal(metricFor(weeklyEntry, "forumThreads").value, 1);
  assert.equal(metricFor(weeklyEntry, "approvedReplies").value, 1);
  assert.equal(metricFor(weeklyEntry, "gameStars").value, 1);
  assert.equal(metricFor(weeklyEntry, "engagedMinutes").value, DAILY_ENGAGED_MINUTES_CAP);
  assert.equal(metricFor(weeklyEntry, "engagedMinutes").points, 12);
  assert.equal(weekly.entries.some((entry) => entry.userId === users[1].id), false);
  assert.equal(weekly.entries.some((entry) => entry.userId === users[3].id), false);

  const monthly = await getLeaderboard("monthly");
  assert.equal(monthly.window, "monthly");
  assert.equal(metricFor(entryFor(monthly, users[1].id), "forumThreads").value, 1);
  assert.equal(metricFor(entryFor(monthly, users[1].id), "gameStars").value, 1);
  assert.equal(monthly.entries.some((entry) => entry.userId === users[2].id), false);

  const allTimeBeforeRemoval = await getLeaderboard("all-time");
  assert.equal(metricFor(entryFor(allTimeBeforeRemoval, users[2].id), "forumThreads").value, 1);
  assert.equal(entryFor(allTimeBeforeRemoval, users[4].id).score > 0, true);

  await db.update(forumActivityEventsTable)
    .set({ isApproved: false })
    .where(and(eq(forumActivityEventsTable.actorUserId, users[4].id), eq(forumActivityEventsTable.eventType, "thread_created")));
  invalidateLeaderboardCache();
  const allTimeAfterRemoval = await getLeaderboard("all-time");
  assert.equal(allTimeAfterRemoval.entries.some((entry) => entry.userId === users[3].id), false);
  assert.equal(allTimeAfterRemoval.entries.some((entry) => entry.userId === users[4].id), false);
});

test("signed-in stars and activity pulses invalidate cached rankings", async (t) => {
  const prefix = fixturePrefix("cache");
  const users = [{ id: `${prefix}-viewer`, displayName: "Cache Viewer" }];
  await insertFixtureUsers(users);
  const sessionId = await createSession({
    user: { id: users[0].id, email: `${users[0].id}@fixture.example`, firstName: "Ranking", lastName: "Fixture", profileImageUrl: null },
    access_token: "fixture-access-token",
    provider: "replit",
  });
  t.after(() => cleanupFixture(users, [sessionId]));

  invalidateLeaderboardCache();
  const empty = await getLeaderboard("weekly", sessionId);
  assert.equal(empty.viewerRank, null);

  const starResponse = await fetch(`${baseUrl}/api/games/lokbook/star`, {
    method: "POST",
    headers: { authorization: `Bearer ${sessionId}`, "content-type": "application/json" },
    body: JSON.stringify({ voterId: `${prefix}-voter`, starred: true }),
  });
  assert.equal(starResponse.status, 200);
  const starred = await getLeaderboard("weekly", sessionId);
  assert.equal(starred.viewerRank, 1);
  assert.equal(metricFor(entryFor(starred, users[0].id), "gameStars").value, 1);

  const removeResponse = await fetch(`${baseUrl}/api/games/lokbook/star`, {
    method: "POST",
    headers: { authorization: `Bearer ${sessionId}`, "content-type": "application/json" },
    body: JSON.stringify({ voterId: `${prefix}-voter`, starred: false }),
  });
  assert.equal(removeResponse.status, 200);
  const unstarred = await getLeaderboard("weekly", sessionId);
  assert.equal(metricFor(entryFor(unstarred, users[0].id), "gameStars").value, 0);
  assert.equal(unstarred.entries.find((entry) => entry.userId === users[0].id)?.score, 3);

  const pulseResponse = await fetch(`${baseUrl}/api/leaderboard/activity`, {
    method: "POST",
    headers: { authorization: `Bearer ${sessionId}`, "content-type": "application/json" },
    body: JSON.stringify({ engagedMinutes: 5 }),
  });
  assert.equal(pulseResponse.status, 200);
  const pulsed = await getLeaderboard("weekly", sessionId);
  assert.equal(metricFor(entryFor(pulsed, users[0].id), "engagedMinutes").value, 5);
});

test("signed-in viewers retain their rank beyond the public top 100 without private fields", async (t) => {
  const prefix = fixturePrefix("top-100");
  const leaders = Array.from({ length: 101 }, (_, index) => ({
    id: `${prefix}-leader-${index}`,
    displayName: `Leader ${String(index).padStart(3, "0")}`,
  }));
  const viewer = { id: `${prefix}-viewer`, displayName: "Private Rank Viewer" };
  const users = [...leaders, viewer];
  await insertFixtureUsers(users);
  const sessionId = await createSession({
    user: { id: viewer.id, email: `${viewer.id}@fixture.example`, firstName: "Ranking", lastName: "Fixture", profileImageUrl: null },
    access_token: "fixture-access-token",
    provider: "replit",
  });
  t.after(() => cleanupFixture(users, [sessionId]));

  await db.insert(memberActivityDailyTable).values([
    ...leaders.map((leader) => ({ userId: leader.id, activityDate: dateDaysAgo(0), engagedMinutes: 120 })),
    { userId: viewer.id, activityDate: dateDaysAgo(0), engagedMinutes: 1 },
  ]);
  invalidateLeaderboardCache();

  const payload = await getLeaderboard("all-time", sessionId);
  assert.equal(payload.entries.length, 100);
  assert.equal(payload.entries.some((entry) => entry.userId === viewer.id), false);
  assert.equal(payload.viewerRank, 102);
  for (const entry of payload.entries) {
    assert.deepEqual(Object.keys(entry).sort(), ["badge", "displayName", "metrics", "rank", "score", "userId"]);
  }
  assert.equal(JSON.stringify(payload).includes("email"), false);
  assert.equal(JSON.stringify(payload).includes("fixture.example"), false);
});