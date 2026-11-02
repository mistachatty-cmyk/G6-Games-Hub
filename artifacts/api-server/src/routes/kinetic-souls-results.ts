import {
  KineticSoulsLeaderboardQuery,
  KineticSoulsLeaderboardResponse,
  KineticSoulsMatchResultBody,
  KineticSoulsMatchResultResponse,
} from "@workspace/api-zod";
import {
  db,
  kineticSoulsMatchResultsTable,
  memberProfilesTable,
} from "@workspace/db";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { getBadge } from "../lib/members";
import { buildKineticSoulsProgress } from "../lib/kinetic-souls-progress";

const GAME_SLUG = "kinetic-souls-2-alpha";
const RESULT_DISCLAIMER = "Casual alpha records are client-reported and are not used for rewards." as const;
const router: IRouter = Router();

router.post("/games/kinetic-souls-2-alpha/results", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Sign-in required" });
    return;
  }

  const input = KineticSoulsMatchResultBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Invalid Kinetic Souls match result" });
    return;
  }

  const [saved] = await db
    .insert(kineticSoulsMatchResultsTable)
    .values({
      userId: req.user.id,
      gameSlug: GAME_SLUG,
      sessionId: input.data.sessionId,
      mode: input.data.mode,
      durationSeconds: input.data.durationSeconds,
      score: input.data.score,
    })
    .onConflictDoNothing({
      target: [
        kineticSoulsMatchResultsTable.userId,
        kineticSoulsMatchResultsTable.gameSlug,
        kineticSoulsMatchResultsTable.sessionId,
      ],
    })
    .returning({ id: kineticSoulsMatchResultsTable.id });

  res.status(saved ? 201 : 200).json(
    KineticSoulsMatchResultResponse.parse({ accepted: true, duplicate: !saved }),
  );
});

router.get("/games/kinetic-souls-2-alpha/leaderboard", async (req, res): Promise<void> => {
  const query = KineticSoulsLeaderboardQuery.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Choose a supported Kinetic Souls match mode." });
    return;
  }

  const bestScore = sql<number>`MAX(${kineticSoulsMatchResultsTable.score})`;
  const matches = count();
  const rows = await db
    .select({
      displayName: memberProfilesTable.displayName,
      badgeSlug: memberProfilesTable.badgeSlug,
      bestScore,
      matches,
    })
    .from(kineticSoulsMatchResultsTable)
    .innerJoin(memberProfilesTable, eq(memberProfilesTable.userId, kineticSoulsMatchResultsTable.userId))
    .where(and(
      eq(kineticSoulsMatchResultsTable.gameSlug, GAME_SLUG),
      eq(kineticSoulsMatchResultsTable.mode, query.data.mode),
    ))
    .groupBy(memberProfilesTable.userId, memberProfilesTable.displayName, memberProfilesTable.badgeSlug)
    .orderBy(desc(bestScore), desc(matches), asc(memberProfilesTable.displayName))
    .limit(25);

  res.json(KineticSoulsLeaderboardResponse.parse({
    generatedAt: new Date().toISOString(),
    mode: query.data.mode,
    disclaimer: RESULT_DISCLAIMER,
    entries: rows.map((row, index) => ({
      rank: index + 1,
      displayName: row.displayName,
      badgeName: getBadge(row.badgeSlug)?.name ?? "Lok Clone",
      bestScore: Number(row.bestScore),
      matches: Number(row.matches),
    })),
  }));
});

router.get("/games/kinetic-souls-2-alpha/progress", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Sign-in required" });
    return;
  }

  const [totals] = await db
    .select({
      matches: count(),
      bestScore: sql<number>`COALESCE(MAX(${kineticSoulsMatchResultsTable.score}), 0)`,
    })
    .from(kineticSoulsMatchResultsTable)
    .where(and(
      eq(kineticSoulsMatchResultsTable.userId, req.user.id),
      eq(kineticSoulsMatchResultsTable.gameSlug, GAME_SLUG),
    ));
  const matches = Number(totals?.matches ?? 0);
  const bestScore = Number(totals?.bestScore ?? 0);

  res.json(buildKineticSoulsProgress(matches, bestScore));
});

export default router;
