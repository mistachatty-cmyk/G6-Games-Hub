import {
  GetGameFeedbackResponse,
  GetGameSocialStatsQueryParams,
  GetGameSocialStatsResponse,
  ReviewGameFeedbackBody,
  ReviewGameFeedbackParams,
  ReviewGameFeedbackResponse,
  SubmitGameFeedbackBody,
  SubmitGameFeedbackParams,
  SubmitGameFeedbackResponse,
  ToggleGameStarBody,
  ToggleGameStarParams,
  ToggleGameStarResponse,
} from "@workspace/api-zod";
import { db, feedbackTable, gameStarsTable, usersTable } from "@workspace/db";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  hashVoterId,
  isSafeGameSlug,
  REGISTERED_GAME_SLUGS,
} from "../lib/social";
import { isGsixOwner } from "../lib/ownership";
import { recordMemberActivity } from "../lib/leaderboard";

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
      .values({
        gameSlug: params.data.slug,
        voterKey,
        memberUserId: req.isAuthenticated() ? req.user.id : null,
      })
      .onConflictDoUpdate({
        target: [gameStarsTable.gameSlug, gameStarsTable.voterKey],
        set: { memberUserId: req.isAuthenticated() ? req.user.id : null },
      });
    if (req.isAuthenticated()) await recordMemberActivity(req.user.id);
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

function ownerOnly(req: Request, res: Response): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Sign in to access private feedback." });
    return false;
  }
  if (!isGsixOwner(req.user)) {
    res.status(403).json({ error: "GSix owner access is required." });
    return false;
  }
  return true;
}

function toFeedbackNote(row: {
  feedback: typeof feedbackTable.$inferSelect;
  user: typeof usersTable.$inferSelect;
}) {
  return {
    id: row.feedback.id,
    gameSlug: row.feedback.gameSlug,
    content: row.feedback.content,
    status: row.feedback.status,
    createdAt: row.feedback.createdAt,
    updatedAt: row.feedback.updatedAt,
    author: {
      id: row.user.id,
      email: row.user.email,
      firstName: row.user.firstName,
      lastName: row.user.lastName,
    },
  };
}

router.get("/games/feedback", async (req, res): Promise<void> => {
  if (!ownerOnly(req, res)) return;

  const rows = await db
    .select({ feedback: feedbackTable, user: usersTable })
    .from(feedbackTable)
    .innerJoin(usersTable, eq(feedbackTable.userId, usersTable.id))
    .orderBy(asc(feedbackTable.gameSlug), desc(feedbackTable.createdAt));

  const groups = new Map<string, ReturnType<typeof toFeedbackNote>[]>();
  for (const row of rows) {
    const notes = groups.get(row.feedback.gameSlug) ?? [];
    notes.push(toFeedbackNote(row));
    groups.set(row.feedback.gameSlug, notes);
  }

  res.json(
    GetGameFeedbackResponse.parse(
      [...groups].map(([gameSlug, notes]) => ({ gameSlug, notes })),
    ),
  );
});

router.patch("/games/feedback/:id", async (req, res): Promise<void> => {
  if (!ownerOnly(req, res)) return;

  const params = ReviewGameFeedbackParams.safeParse(req.params);
  const body = ReviewGameFeedbackBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Feedback review must set status to reviewed." });
    return;
  }

  const [updated] = await db
    .update(feedbackTable)
    .set({ status: body.data.status, updatedAt: new Date() })
    .where(eq(feedbackTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Feedback not found." });
    return;
  }

  const [author] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, updated.userId));
  if (!author) {
    res.status(404).json({ error: "Feedback author not found." });
    return;
  }

  res.json(
    ReviewGameFeedbackResponse.parse(
      toFeedbackNote({ feedback: updated, user: author }),
    ),
  );
});

export default router;