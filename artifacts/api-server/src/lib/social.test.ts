import assert from "node:assert/strict";
import test from "node:test";
import {
  hashVoterId,
  isSafeGameSlug,
  REGISTERED_GAME_SLUGS,
} from "./social";

test("registered game slugs are safe route identifiers", () => {
  assert.equal(new Set(REGISTERED_GAME_SLUGS).size, REGISTERED_GAME_SLUGS.length);
  for (const slug of REGISTERED_GAME_SLUGS) {
    assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(isSafeGameSlug(slug), true);
  }
});

test("browser voter identifiers are deterministically hashed", () => {
  assert.equal(hashVoterId("browser-a"), hashVoterId("browser-a"));
  assert.notEqual(hashVoterId("browser-a"), hashVoterId("browser-b"));
  assert.equal(hashVoterId("browser-a").length, 64);
});