import crypto from "node:crypto";
import type { AuthUser } from "@workspace/api-zod";
import { db, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request, Response } from "express";
import * as oidc from "openid-client";

export const ISSUER_URL = process.env.ISSUER_URL ?? "https://replit.com/oidc";
export const SESSION_COOKIE = "sid";
export const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

export const AUTH_PROVIDERS = ["replit", "google", "apple"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export interface SessionData {
  user: AuthUser;
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  provider?: AuthProvider;
}

const oidcConfigs = new Map<AuthProvider, oidc.Configuration>();

type ProviderSettings = {
  issuer: string;
  clientId: string | undefined;
  clientSecret?: string;
};

function getProviderSettings(provider: AuthProvider): ProviderSettings {
  if (provider === "google") {
    return {
      issuer: process.env.GOOGLE_ISSUER_URL ?? "https://accounts.google.com",
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    };
  }
  if (provider === "apple") {
    return {
      issuer: process.env.APPLE_ISSUER_URL ?? "https://appleid.apple.com",
      clientId: process.env.APPLE_CLIENT_ID,
      clientSecret: process.env.APPLE_CLIENT_SECRET,
    };
  }
  return {
    issuer: ISSUER_URL,
    clientId: process.env.REPL_ID,
  };
}

export function getAuthProviderClientId(provider: AuthProvider): string | undefined {
  return getProviderSettings(provider).clientId;
}

export function isAuthProvider(value: unknown): value is AuthProvider {
  return typeof value === "string" && AUTH_PROVIDERS.includes(value as AuthProvider);
}

export function getConfiguredAuthProviders() {
  return AUTH_PROVIDERS.filter((provider) => {
    const settings = getProviderSettings(provider);
    return Boolean(settings.clientId && (provider === "replit" || settings.clientSecret));
  });
}

export async function getOidcConfig(provider: AuthProvider = "replit"): Promise<oidc.Configuration> {
  const cached = oidcConfigs.get(provider);
  if (cached) return cached;

  const settings = getProviderSettings(provider);
  if (!settings.clientId || (provider !== "replit" && !settings.clientSecret)) {
    throw new Error(`${provider} authentication is not configured.`);
  }

  const config = settings.clientSecret
    ? await oidc.discovery(
        new URL(settings.issuer),
        settings.clientId,
        settings.clientSecret,
      )
    : await oidc.discovery(new URL(settings.issuer), settings.clientId);
  oidcConfigs.set(provider, config);
  return config;
}

export async function createSession(data: SessionData): Promise<string> {
  const sid = crypto.randomBytes(32).toString("hex");
  await db.insert(sessionsTable).values({
    sid,
    sess: data as unknown as Record<string, unknown>,
    expire: new Date(Date.now() + SESSION_TTL),
  });
  return sid;
}

export async function getSession(sid: string): Promise<SessionData | null> {
  const [row] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.sid, sid));

  if (!row || row.expire < new Date()) {
    if (row) await deleteSession(sid);
    return null;
  }
  return row.sess as unknown as SessionData;
}

export async function updateSession(
  sid: string,
  data: SessionData,
): Promise<void> {
  await db
    .update(sessionsTable)
    .set({
      sess: data as unknown as Record<string, unknown>,
      expire: new Date(Date.now() + SESSION_TTL),
    })
    .where(eq(sessionsTable.sid, sid));
}

export async function deleteSession(sid: string): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.sid, sid));
}

export async function clearSession(res: Response, sid?: string): Promise<void> {
  if (sid) await deleteSession(sid);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function getSessionId(req: Request): string | undefined {
  const authorization = req.headers.authorization;
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7);
  return req.cookies?.[SESSION_COOKIE];
}