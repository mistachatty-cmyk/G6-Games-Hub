import { UpdateKineticSoulsSettingsBody } from "@workspace/api-zod";
import { db, kineticSoulsSettingsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";

const GAME_SLUG = "kinetic-souls-2-alpha";
const router: IRouter = Router();

router.get("/games/kinetic-souls-2-alpha/settings", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Sign-in required" });
    return;
  }
  const [saved] = await db
    .select({ modelStyle: kineticSoulsSettingsTable.modelStyle })
    .from(kineticSoulsSettingsTable)
    .where(and(
      eq(kineticSoulsSettingsTable.userId, req.user.id),
      eq(kineticSoulsSettingsTable.gameSlug, GAME_SLUG),
    ))
    .limit(1);
  res.json({ modelStyle: saved?.modelStyle ?? null });
});

router.put("/games/kinetic-souls-2-alpha/settings", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Sign-in required" });
    return;
  }
  const input = UpdateKineticSoulsSettingsBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Invalid fighter model style" });
    return;
  }
  const [saved] = await db
    .insert(kineticSoulsSettingsTable)
    .values({
      userId: req.user.id,
      gameSlug: GAME_SLUG,
      modelStyle: input.data.modelStyle,
    })
    .onConflictDoUpdate({
      target: [kineticSoulsSettingsTable.userId, kineticSoulsSettingsTable.gameSlug],
      set: { modelStyle: input.data.modelStyle, updatedAt: new Date() },
    })
    .returning({ modelStyle: kineticSoulsSettingsTable.modelStyle });
  res.json({ modelStyle: saved.modelStyle });
});

export default router;
