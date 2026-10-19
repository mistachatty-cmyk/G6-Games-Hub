import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import gamesRouter from "./games";
import membersRouter from "./members";
import forumRouter from "./forum";
import leaderboardRouter from "./leaderboard";
import kineticSoulsSettingsRouter from "./kinetic-souls-settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(gamesRouter);
router.use(membersRouter);
router.use(forumRouter);
router.use(leaderboardRouter);
router.use(kineticSoulsSettingsRouter);

export default router;
