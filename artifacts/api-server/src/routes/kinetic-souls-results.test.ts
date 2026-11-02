import assert from "node:assert/strict";
import test from "node:test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/kinetic_souls_test";
const { default: router } = await import("./kinetic-souls-results");

let server: Server;
let baseUrl: string;
let signedIn = false;

test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (signedIn) req.user = { id: "test-user" } as NonNullable<typeof req.user>;
    Object.defineProperty(req, "isAuthenticated", { value: () => signedIn });
    next();
  });
  app.use(router);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("requires a signed-in account before accepting a match result", async () => {
  signedIn = false;
  const response = await fetch(`${baseUrl}/games/kinetic-souls-2-alpha/results`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      version: 1,
      sessionId: "00000000-0000-4000-8000-000000000001",
      mode: "score",
      durationSeconds: 120,
      score: 12,
    }),
  });
  assert.equal(response.status, 401);
  const progress = await fetch(`${baseUrl}/games/kinetic-souls-2-alpha/progress`);
  assert.equal(progress.status, 401);
});

test("rejects malformed or out-of-range client-reported results at the API edge", async () => {
  signedIn = true;
  const invalid = [
    { version: 2, sessionId: "00000000-0000-4000-8000-000000000001", mode: "score", durationSeconds: 120, score: 12 },
    { version: 1, sessionId: "not-a-uuid", mode: "score", durationSeconds: 120, score: 12 },
    { version: 1, sessionId: "00000000-0000-4000-8000-000000000002", mode: "unsupported", durationSeconds: 120, score: 12 },
    { version: 1, sessionId: "00000000-0000-4000-8000-000000000003", mode: "score", durationSeconds: 4, score: 12 },
    { version: 1, sessionId: "00000000-0000-4000-8000-000000000004", mode: "score", durationSeconds: 120, score: 1_000_001 },
  ];
  for (const body of invalid) {
    const response = await fetch(`${baseUrl}/games/kinetic-souls-2-alpha/results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 400);
  }
});

test("rejects unsupported leaderboard modes without querying results", async () => {
  const response = await fetch(`${baseUrl}/games/kinetic-souls-2-alpha/leaderboard?mode=script`);
  assert.equal(response.status, 400);
});
