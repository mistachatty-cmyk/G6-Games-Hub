---
name: Member identity continuity
description: The account-linking rule for adding Google, Apple, and future Lok Ecosystem identities without breaking existing sessions.
---

Provider subject IDs are external identity keys, not the long-term G6 member ID. New provider identities should map through the internal member identity layer; verified provider emails may link to an existing member, while legacy subject-based user rows must remain readable so active sessions continue working.

**Why:** The original session flow stored an OIDC subject directly as the user ID, but future sign-in providers need one account to support multiple identities.

**How to apply:** Add provider-specific identity records and keep session payloads keyed by the internal member ID. Never expose provider subjects, access tokens, or private emails in public community responses.