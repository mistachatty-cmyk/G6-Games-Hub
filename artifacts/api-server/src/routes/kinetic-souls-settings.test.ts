import assert from "node:assert/strict";
import test from "node:test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/kinetic_souls_test";
const { default: router } = await import("./kinetic-souls-settings");
const { pool } = await import("@workspace/db");

let server: Server;
let baseUrl: string;

test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "test-user" } as NonNullable<typeof req.user>;
    Object.defineProperty(req, "isAuthenticated", { value: () => true });
    next();
  });
  app.use(router);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await pool.end();
});

test("rejects unknown Kinetic Souls fighter model styles", async () => {
  for (const modelStyle of ["v3", "unknown", "", null]) {
    const response = await fetch(`${baseUrl}/games/kinetic-souls-2-alpha/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelStyle }),
    });
    assert.equal(response.status, 400, `Expected ${String(modelStyle)} to be rejected`);
  }
});
