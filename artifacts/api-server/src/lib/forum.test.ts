import assert from "node:assert/strict";
import test from "node:test";
import {
  FORUM_CATEGORIES,
  FORUM_EDIT_WINDOW_MS,
  canModerate,
  cleanForumText,
  forumExcerpt,
  isWithinForumEditWindow,
  rateLimitForumAction,
} from "./forum";

test("forum text is trimmed, null-safe, and excerpted without leaking markup", () => {
  const content = cleanForumText("  A\u0000 useful\n signal  ");
  assert.equal(content, "A useful\n signal");
  assert.equal(forumExcerpt("A\n\nlong signal", 8), "A long …");
});

test("forum edit ownership window is exactly bounded by the configured duration", () => {
  const now = Date.now();
  assert.equal(isWithinForumEditWindow(new Date(now - FORUM_EDIT_WINDOW_MS + 1)), true);
  assert.equal(isWithinForumEditWindow(new Date(now - FORUM_EDIT_WINDOW_MS - 1)), false);
});

test("forum moderation only accepts elevated roles", () => {
  assert.equal(canModerate("owner"), true);
  assert.equal(canModerate("admin"), true);
  assert.equal(canModerate("moderator"), true);
  assert.equal(canModerate("member"), false);
  assert.equal(canModerate(undefined), false);
});

test("forum creation throttling rejects the next action inside its window", () => {
  const key = `forum-test-${Date.now()}-${Math.random()}`;
  assert.deepEqual(rateLimitForumAction(key, 1, 60_000).allowed, true);
  const limited = rateLimitForumAction(key, 1, 60_000);
  assert.equal(limited.allowed, false);
  assert.ok(limited.retryAfterSeconds >= 1);
});

test("forum categories remain public and ordered", () => {
  assert.deepEqual(FORUM_CATEGORIES.map((category) => category.slug), [
    "game-room",
    "field-notes",
    "lounge",
  ]);
});