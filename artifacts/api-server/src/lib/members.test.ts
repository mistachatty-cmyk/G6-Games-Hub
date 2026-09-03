import assert from "node:assert/strict";
import test from "node:test";
import { BADGE_CATALOG, fallbackDisplayName, roleForUser } from "./members";

test("new members receive the Lok Clone badge and catalog metadata", () => {
  const defaultBadge = BADGE_CATALOG.find((badge) => badge.isDefault);
  assert.equal(defaultBadge?.slug, "lok-clone");
  assert.equal(defaultBadge?.isSelectable, true);
  assert.deepEqual(BADGE_CATALOG.map((badge) => badge.name), [
    "Lok Clone",
    "Lok Knight",
    "Lokness Monster",
    "Lok Clown",
    "Lok Loner",
    "Lok Lit",
  ]);
});

test("member role resolution gives the owner allowlist precedence", () => {
  const previousIds = process.env.GSIX_OWNER_IDS;
  process.env.GSIX_OWNER_IDS = "owner-123";
  try {
    assert.equal(
      roleForUser({ id: "owner-123", email: null }, "member"),
      "owner",
    );
    assert.equal(
      roleForUser({ id: "member-123", email: null }, "moderator"),
      "moderator",
    );
    assert.equal(
      roleForUser({ id: "member-123", email: null }, "unknown"),
      "member",
    );
  } finally {
    if (previousIds === undefined) delete process.env.GSIX_OWNER_IDS;
    else process.env.GSIX_OWNER_IDS = previousIds;
  }
});

test("fallback display names never expose the private email address", () => {
  const name = fallbackDisplayName({
    id: "member-123456",
    firstName: null,
    lastName: null,
    email: "quiet.signal@example.com",
  });
  assert.equal(name, "quietsignal");
  assert.notEqual(name, "quiet.signal@example.com");
});