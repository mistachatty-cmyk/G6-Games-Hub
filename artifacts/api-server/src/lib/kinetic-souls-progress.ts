import { KineticSoulsProgressResponse } from "@workspace/api-zod";

export function buildKineticSoulsProgress(matches: number, bestScore: number) {
  return KineticSoulsProgressResponse.parse({
    matches,
    bestScore,
    achievements: [
      { id: "first-match", title: "First Contact", description: "Finish your first recorded match.", unlocked: matches >= 1 },
      { id: "ten-matches", title: "Regular Signal", description: "Finish ten recorded matches.", unlocked: matches >= 10 },
      { id: "score-500", title: "Momentum", description: "Reach a score of 500 in a match.", unlocked: bestScore >= 500 },
      { id: "score-1000", title: "Overdrive", description: "Reach a score of 1,000 in a match.", unlocked: bestScore >= 1_000 },
    ],
  });
}
