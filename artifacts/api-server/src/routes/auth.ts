import {
  GetAuthProvidersResponse,
  GetCurrentAuthUserResponse,
} from "@workspace/api-zod";
import { authIdentitiesTable, db, usersTable, type User } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import * as oidc from "openid-client";
import {
  AUTH_PROVIDERS,
  clearSession,
  createSession,
  getAuthProviderClientId,
  getConfiguredAuthProviders,
  getOidcConfig,
  getSession,
  getSessionId,
  isAuthProvider,
  SESSION_COOKIE,
  SESSION_TTL,
  type SessionData,
  type AuthProvider,
} from "../lib/auth";
import { isGsixOwner } from "../lib/ownership";
import { ensureMemberProfile, getStoredRole, roleForUser } from "../lib/members";

const router: IRouter = Router();
const OIDC_COOKIE_TTL = 10 * 60 * 1000;

function getOrigin(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  return `${proto}://${host}`;
}

function setSessionCookie(res: Response, sid: string): void {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

function setOidcCookie(res: Response, name: string, value: string): void {
  res.cookie(name, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: OIDC_COOKIE_TTL,
  });
}

function getSafeReturnTo(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return "/";
  }
  return value;
}

function claimString(claims: Record<string, unknown>, ...names: string[]) {
  for (const name of names) {
    const value = claims[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function claimEmailIsVerified(claims: Record<string, unknown>) {
  return claims.email_verified === true || claims.email_verified === "true";
}

async function upsertUser(claims: Record<string, unknown>, provider: AuthProvider) {
  const subject = claimString(claims, "sub");
  if (!subject) throw new Error("The identity provider did not return a subject.");

  const email = claimString(claims, "email");
  const firstName = claimString(claims, "first_name", "given_name");
  const lastName = claimString(claims, "last_name", "family_name");
  const profileImageUrl = claimString(claims, "profile_image_url", "picture");
  const [identity] = await db
    .select({ userId: authIdentitiesTable.userId })
    .from(authIdentitiesTable)
    .where(
      and(
        eq(authIdentitiesTable.provider, provider),
        eq(authIdentitiesTable.subject, subject),
      ),
    );

  let user: User | undefined;
  if (identity) {
    [user] = await db.select().from(usersTable).where(eq(usersTable.id, identity.userId));
  }
  if (!user) {
    [user] = await db.select().from(usersTable).where(eq(usersTable.id, subject));
  }
  if (!user && email && claimEmailIsVerified(claims)) {
    [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  }
  if (!user) {
    [user] = await db
      .insert(usersTable)
      .values({ email, firstName, lastName, profileImageUrl })
      .returning();
  } else {
    [user] = await db
      .update(usersTable)
      .set({
        email: email ?? user.email,
        firstName: firstName ?? user.firstName,
        lastName: lastName ?? user.lastName,
        profileImageUrl: profileImageUrl ?? user.profileImageUrl,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, user.id))
      .returning();
  }
  if (!user) throw new Error("The account could not be created.");

  await db
    .insert(authIdentitiesTable)
    .values({ provider, subject, userId: user.id })
    .onConflictDoNothing();
  return user;
}

router.get("/auth/user", (req: Request, res: Response): void => {
  const user = req.isAuthenticated() ? req.user : null;
  void (async () => {
    const role = user
      ? roleForUser(user, await getStoredRole(user.id))
      : "member";
    res.json(
      GetCurrentAuthUserResponse.parse({
        user,
        isOwner: role === "owner",
        role,
      }),
    );
  })().catch((error) => {
    req.log.error({ err: error }, "Could not load auth state");
    res.status(500).json({ error: "Could not load auth state." });
  });
});

router.get("/auth/providers", (_req: Request, res: Response): void => {
  const configured = new Set(getConfiguredAuthProviders());
  res.json(
    GetAuthProvidersResponse.parse({
      providers: AUTH_PROVIDERS.map((id) => ({
        id,
        label: id === "replit" ? "GSix account" : id[0].toUpperCase() + id.slice(1),
        enabled: configured.has(id),
      })),
    }),
  );
});

router.get("/login", async (req: Request, res: Response): Promise<void> => {
  const requestedProvider = req.query.provider;
  const provider: AuthProvider = isAuthProvider(requestedProvider)
    ? requestedProvider
    : "replit";
  if (!getConfiguredAuthProviders().includes(provider)) {
    res.status(503).json({ error: `${provider} sign-in is not configured.` });
    return;
  }
  const config = await getOidcConfig(provider);
  const callbackUrl = `${getOrigin(req)}/api/callback`;
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const redirectTo = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    scope: "openid email profile offline_access",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "login consent",
    state,
    nonce,
  });

  setOidcCookie(res, "code_verifier", codeVerifier);
  setOidcCookie(res, "nonce", nonce);
  setOidcCookie(res, "state", state);
  setOidcCookie(res, "return_to", getSafeReturnTo(req.query.returnTo));
  setOidcCookie(res, "auth_provider", provider);
  res.redirect(redirectTo.href);
});

router.get("/callback", async (req: Request, res: Response): Promise<void> => {
  const provider: AuthProvider = isAuthProvider(req.cookies?.auth_provider)
    ? req.cookies.auth_provider
    : "replit";
  const config = await getOidcConfig(provider);
  const callbackUrl = `${getOrigin(req)}/api/callback`;
  const codeVerifier = req.cookies?.code_verifier;
  const nonce = req.cookies?.nonce;
  const expectedState = req.cookies?.state;

  if (!codeVerifier || !expectedState) {
    res.redirect("/api/login");
    return;
  }

  const currentUrl = new URL(
    `${callbackUrl}?${new URL(req.url, `http://${req.headers.host}`).searchParams}`,
  );
  let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
  try {
    tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedNonce: nonce,
      expectedState,
      idTokenExpected: true,
    });
  } catch (error) {
    req.log.warn({ err: error }, "OIDC callback validation failed");
    res.redirect("/api/login");
    return;
  }

  const returnTo = getSafeReturnTo(req.cookies?.return_to);
  for (const cookie of ["code_verifier", "nonce", "state", "return_to", "auth_provider"]) {
    res.clearCookie(cookie, { path: "/" });
  }
  const claims = tokens.claims();
  if (!claims) {
    res.redirect("/api/login");
    return;
  }

  const user = await upsertUser(claims as unknown as Record<string, unknown>, provider);
  await ensureMemberProfile(user);
  const now = Math.floor(Date.now() / 1000);
  const sessionData: SessionData = {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
    },
    provider,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
  };
  setSessionCookie(res, await createSession(sessionData));
  res.redirect(returnTo);
});

router.get("/logout", async (req: Request, res: Response): Promise<void> => {
  const origin = getOrigin(req);
  const returnTo = getSafeReturnTo(req.query.returnTo);
  const session = await (async () => {
    const sid = getSessionId(req);
    if (!sid) return null;
    try {
      return await getSession(sid);
    } catch {
      return null;
    }
  })();
  await clearSession(res, getSessionId(req));
  try {
    const config = await getOidcConfig(session?.provider ?? "replit");
    const provider = session?.provider ?? "replit";
    const clientId = getAuthProviderClientId(provider);
    if (!clientId) {
      res.redirect(returnTo);
      return;
    }
    const endSessionUrl = oidc.buildEndSessionUrl(config, {
      client_id: clientId,
      post_logout_redirect_uri: new URL(returnTo, `${origin}/`).href,
    });
    res.redirect(endSessionUrl.href);
  } catch {
    res.redirect(returnTo);
  }
});

export default router;