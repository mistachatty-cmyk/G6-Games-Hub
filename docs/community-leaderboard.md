# Community leaderboard contract

The GSix community leaderboard is intentionally a low-resolution, privacy-safe
participation signal. It never returns email addresses, provider identities,
raw activity timelines, or private content.

## Windows and ties

- **Weekly** includes the current UTC calendar day and the six preceding days.
- **Monthly** includes the current UTC calendar day and the 29 preceding days.
- **All time** has no lower date boundary.
- Entries are ordered by descending score, then display name. Equal scores share
  the same rank (competition ranking: 1, 1, 3).
- Public responses are limited to the first 100 entries. A signed-in member's
  rank is calculated against the complete ranked set.

## Current scoring

| Signal | Points | Cap / condition |
| --- | ---: | --- |
| Published forum thread | 6 | Must remain approved |
| Approved forum reply | 4 | Must remain approved |
| Signed-in game star | 2 | One current star per game |
| Distinct return day | 3 | No timeline is exposed |
| Engaged minutes | 1 per 10 minutes | 120 minutes per member per UTC day |

Moderated, removed, and deleted forum activity is excluded. Anonymous game
stars remain anonymous and do not enter member rankings.

Useful reactions, accepted answers, verified kills, verified sessions, and
cross-app achievements are explicit disabled extension points. Verified event
adapters use the versioned `v1` shape and must provide a real member identity;
the leaderboard does not invent values for unavailable sources.

## Refresh and activity collection

Rankings are cached in memory for 60 seconds. Signed-in clients can send a
five-minute pulse only while the page is visible and recently engaged. Daily
minutes are accumulated server-side and capped before scoring. WebSockets and
real-time presence are intentionally out of scope.

Moderator diagnostics contain only aggregate counts and cache health. Scores
cannot be manually edited; changing role or content moderation remains the
audited path that changes eligible activity.