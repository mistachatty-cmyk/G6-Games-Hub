import crypto from "node:crypto";

export const REGISTERED_GAME_SLUGS = [
  "616-survivor",
  "lokbook",
  "loklingu",
  "rune-diary",
  "kinetic-souls-classic",
  "kinetic-souls-2-alpha",
] as const;

export function isSafeGameSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function hashVoterId(voterId: string): string {
  return crypto.createHash("sha256").update(voterId).digest("hex");
}