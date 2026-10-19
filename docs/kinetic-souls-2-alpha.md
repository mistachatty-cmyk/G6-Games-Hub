# Kinetic Souls 2 GSix integration

## Account settings and casual match records

The KS2 iframe stores guest fighter style locally and sends typed messages to the GSix parent. The parent validates the iframe origin and window source, then makes authenticated API requests with its own session cookie. No session token or cookie is sent into the game frame.

Account settings and match records are stored per user and game. The match-result endpoint accepts a versioned payload and uses a unique `(user, game, session)` key for idempotency. Current scores are supplied by the client, so leaderboard records are explicitly casual alpha data: they are not verified rankings and cannot grant rewards. The account progress endpoint computes four simple milestones from accepted match rows (first match, ten matches, score 500, and score 1,000); these are profile progress only, not economy rewards.

## Database release step

The schema is defined in `lib/db/src/schema/game-social.ts`. The repository currently uses Drizzle Kit schema push rather than checked-in SQL migrations:

```sh
pnpm --filter @workspace/db run push
```

Run this only after confirming `DATABASE_URL` points to the intended environment and reviewing the generated changes. The API release requires the `kinetic_souls_settings` and `kinetic_souls_match_results` tables and their unique/index definitions. Preview and production databases must be handled separately. Do not paste or print the connection string in logs.

## Deploy order

1. Apply the schema and deploy the API with settings/results routes.
2. Deploy the GSix parent bridge and verify origin/source checks, account fallback, and the casual records UI.
3. Deploy KS2 and verify model selection and one signed-in result submission through the embedded route.

Keep guest play available if account sync or result submission fails. Match records remain disabled for rewards until a trusted server-side validation design is implemented.
