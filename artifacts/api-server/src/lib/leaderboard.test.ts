import assert from "node:assert/strict";
import test from "node:test";
import {
  DAILY_ENGAGED_MINUTES_CAP,
  LEADERBOARD_SCORING,
  compareLeaderboardRows,
  leaderboardWindowStart,
  scoreEngagedMinutes,
  utcActivityDate,
} from "./leaderboard";

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