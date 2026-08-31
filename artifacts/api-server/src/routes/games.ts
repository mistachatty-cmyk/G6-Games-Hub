import {
  GetGameSocialStatsQueryParams,
  GetGameSocialStatsResponse,
  SubmitGameFeedbackBody,
  SubmitGameFeedbackParams,
  SubmitGameFeedbackResponse,
  ToggleGameStarBody,
  ToggleGameStarParams,
  ToggleGameStarResponse,
} from "@workspace/api-zod";
import { db, feedbackTable, gameStarsTable } from "@workspace/db";
import { and, count, eq, inArray } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  hashVoterId,
  isSafeGameSlug,
  REGISTERED_GAME_SLUGS,
} from "../lib/social";

const router: IRouter = Router();

async function getStats(gameSlugs: string[], voterId?: string) {
  const counts = await db
    .select({ gameSlug: gameStarsTable.gameSlug, starCount: count() })
    .from(gameStarsTable)
    .where(inArray(gameStarsTable.gameSlug, gameSlugs))
    .groupBy(gameStarsTable.gameSlug);
  const starred = voterId
    ? await db
        .select({ gameSlug: gameStarsTable.gameSlug })
        .from(gameStarsTable)
        .where(
          and(
            inArray(gameStarsTable.gameSlug, gameSlugs),
            eq(gameStarsTable.voterKey, hashVoterId(voterId)),
          ),
        )
    : [];
  const starredSet = new Set(starred.map((row) => row.gameSlug));
  const countMap = new Map(counts.map((row) => [row.gameSlug, Number(row.starCount)]));
  return gameSlugs.map((gameSlug) => ({
    gameSlug,
    starCount: countMap.get(gameSlug) ?? 0,
    starred: starredSet.has(gameSlug),
  }));
}

router.get("/games/stats", async (req, res): Promise<void> => {
  const query = GetGameSocialStatsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const voterId = query.data.voterId;
  res.json(
    GetGameSocialStatsResponse.parse(
      await getStats([...REGISTERED_GAME_SLUGS], voterId),
    ),
  );
});

router.post("/games/:slug/star", async (req, res): Promise<void> => {
  const params = ToggleGameStarParams.safeParse(req.params);
  const body = ToggleGameStarBody.safeParse(req.body);
  if (!params.success || !body.success || !isSafeGameSlug(params.data.slug)) {
    res.status(400).json({ error: "Invalid star request" });
    return;
  }
  const voterKey = hashVoterId(body.data.voterId);
  if (body.data.starred) {
    await db
      .insert(gameStarsTable)
      .values({ gameSlug: params.data.slug, voterKey })
      .onConflictDoNothing();
  } else {
    await db
      .delete(gameStarsTable)
      .where(
        and(
          eq(gameStarsTable.gameSlug, params.data.slug),
          eq(gameStarsTable.voterKey, voterKey),
        ),
      );
  }
  const [stats] = await getStats([params.data.slug], body.data.voterId);
  res.json(ToggleGameStarResponse.parse(stats));
});

router.post("/games/:slug/feedback", async (req, res): Promise<void> => {
  const params = SubmitGameFeedbackParams.safeParse(req.params);
  const body = SubmitGameFeedbackBody.safeParse(req.body);
  if (!params.success || !body.success || !isSafeGameSlug(params.data.slug)) {
    res.status(400).json({ error: "Feedback must be between 4 and 2000 characters." });
    return;
  }
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Sign in to send private feedback." });
    return;
  }
  const content = body.data.content.trim();
  if (content.length < 4) {
    res.status(400).json({ error: "Feedback must be between 4 and 2000 characters." });
    return;
  }
  await db.insert(feedbackTable).values({
    gameSlug: params.data.slug,
    userId: req.user.id,
    content,
  });
  res.status(201).json(
    SubmitGameFeedbackResponse.parse({
      received: true,
      message: "Your note is in the private review queue.",
    }),
  );
});

export default router;