import { z } from "zod";

export const KINETIC_SOULS_RESULT_VERSION = 1 as const;
export const KINETIC_SOULS_RESULT_MODES = [
  "timer",
  "score",
  "horde",
  "infection",
  "unlimited",
  "boss_rush",
] as const;

export const KineticSoulsMatchResultBody = z.object({
  version: z.literal(KINETIC_SOULS_RESULT_VERSION),
  sessionId: z.string().uuid(),
  mode: z.enum(KINETIC_SOULS_RESULT_MODES),
  durationSeconds: z.number().int().min(5).max(3600),
  score: z.number().int().min(0).max(1_000_000),
}).strict();

export const KineticSoulsMatchResultResponse = z.object({
  accepted: z.literal(true),
  duplicate: z.boolean(),
});

export const KineticSoulsLeaderboardQuery = z.object({
  mode: z.enum(KINETIC_SOULS_RESULT_MODES).default("score"),
});

export const KineticSoulsLeaderboardResponse = z.object({
  generatedAt: z.string().datetime(),
  mode: z.enum(KINETIC_SOULS_RESULT_MODES),
  disclaimer: z.literal("Casual alpha records are client-reported and are not used for rewards."),
  entries: z.array(z.object({
    rank: z.number().int().positive(),
    displayName: z.string(),
    badgeName: z.string(),
    bestScore: z.number().int().nonnegative(),
    matches: z.number().int().positive(),
  })),
});

export const KineticSoulsProgressResponse = z.object({
  matches: z.number().int().nonnegative(),
  bestScore: z.number().int().nonnegative(),
  achievements: z.array(z.object({
    id: z.enum(["first-match", "ten-matches", "score-500", "score-1000"]),
    title: z.string(),
    description: z.string(),
    unlocked: z.boolean(),
  })).length(4),
});

export type KineticSoulsMatchResultPayload = z.infer<typeof KineticSoulsMatchResultBody>;
export type KineticSoulsLeaderboardPayload = z.infer<typeof KineticSoulsLeaderboardResponse>;
