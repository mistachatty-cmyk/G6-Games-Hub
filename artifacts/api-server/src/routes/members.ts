import {
  GetMemberBadgesResponse,
  GetMemberPublicProfileParams,
  GetMemberPublicProfileResponse,
  GetMemberRolesResponse,
  GetMyMemberProfileResponse,
  UpdateMemberRoleBody,
  UpdateMemberRoleParams,
  UpdateMemberRoleResponse,
  UpdateMyMemberProfileBody,
  UpdateMyMemberProfileResponse,
} from "@workspace/api-zod";
import {
  db,
  memberProfilesTable,
  memberRoleAuditTable,
  memberRolesTable,
  usersTable,
  type User,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { isGsixOwner } from "../lib/ownership";
import {
  BADGE_CATALOG,
  DISPLAY_NAME_PATTERN,
  ensureMemberProfile,
  fallbackDisplayName,
  getBadge,
  getStoredRole,
  roleForUser,
} from "../lib/members";

const router: IRouter = Router();

function authRequired(req: Request, res: Response): req is Request & { user: NonNullable<Request["user"]> } {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Sign in to manage your member profile." });
    return false;
  }
  return true;
}

function ownerOnly(req: Request, res: Response): req is Request & { user: NonNullable<Request["user"]> } {
  if (!authRequired(req, res)) return false;
  if (!isGsixOwner(req.user)) {
    res.status(403).json({ error: "GSix owner access is required." });
    return false;
  }
  return true;
}

async function userById(userId: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  return user;
}

function publicBadge(slug: string) {
  return getBadge(slug) ?? BADGE_CATALOG[0];
}

function toPublicProfile(user: User, profile: typeof memberProfilesTable.$inferSelect) {
  return {
    userId: user.id,
    displayName: profile.displayName,
    badge: publicBadge(profile.badgeSlug),
    createdAt: profile.createdAt,
  };
}

async function currentProfile(user: User) {
  const profile = await ensureMemberProfile(user);
  const storedRole = await getStoredRole(user.id);
  return {
    ...toPublicProfile(user, profile),
    role: roleForUser(user, storedRole),
    earnedBadges: profile.earnedBadges,
  };
}

async function roleRecord(user: User, profile?: typeof memberProfilesTable.$inferSelect | null, storedRole?: string | null) {
  const effectiveProfile = profile ?? (await ensureMemberProfile(user));
  return {
    userId: user.id,
    displayName: effectiveProfile.displayName,
    badge: publicBadge(effectiveProfile.badgeSlug),
    role: roleForUser(user, storedRole ?? (await getStoredRole(user.id))),
  };
}

router.get("/members/badges", (_req, res): void => {
  res.json(GetMemberBadgesResponse.parse(BADGE_CATALOG));
});

router.get("/members/me", async (req, res): Promise<void> => {
  if (!authRequired(req, res)) return;
  const user = await userById(req.user.id);
  if (!user) {
    res.status(401).json({ error: "Your account is no longer available." });
    return;
  }
  res.json(GetMyMemberProfileResponse.parse(await currentProfile(user)));
});

router.patch("/members/me", async (req, res): Promise<void> => {
  if (!authRequired(req, res)) return;
  const body = UpdateMyMemberProfileBody.safeParse(req.body);
  if (!body.success || Object.keys(body.data).length === 0) {
    res.status(400).json({ error: "Choose a display name or badge." });
    return;
  }
  if (
    body.data.displayName &&
    !DISPLAY_NAME_PATTERN.test(body.data.displayName)
  ) {
    res.status(400).json({ error: "Display name contains unsupported characters." });
    return;
  }
  if (body.data.badgeSlug && !getBadge(body.data.badgeSlug)?.isSelectable) {
    res.status(400).json({ error: "That badge is not selectable." });
    return;
  }

  const [existingName] = body.data.displayName
    ? await db
        .select({ userId: memberProfilesTable.userId })
        .from(memberProfilesTable)
        .where(eq(memberProfilesTable.displayName, body.data.displayName))
    : [];
  if (existingName && existingName.userId !== req.user.id) {
    res.status(409).json({ error: "That display name is already in use." });
    return;
  }

  const user = await userById(req.user.id);
  if (!user) {
    res.status(401).json({ error: "Your account is no longer available." });
    return;
  }
  const profile = await ensureMemberProfile(user);
  try {
    await db
      .update(memberProfilesTable)
      .set({
        ...(body.data.displayName ? { displayName: body.data.displayName.trim() } : {}),
        ...(body.data.badgeSlug ? { badgeSlug: body.data.badgeSlug } : {}),
        updatedAt: new Date(),
      })
      .where(eq(memberProfilesTable.userId, req.user.id));
  } catch (error) {
    req.log.warn({ err: error }, "Member profile update failed");
    res.status(409).json({ error: "That display name is already in use." });
    return;
  }
  const updated = await currentProfile(user);
  res.json(UpdateMyMemberProfileResponse.parse(updated));
});

router.get("/members/roles", async (req, res): Promise<void> => {
  if (!ownerOnly(req, res)) return;
  const rows = await db
    .select({ user: usersTable, profile: memberProfilesTable, role: memberRolesTable.role })
    .from(usersTable)
    .leftJoin(memberProfilesTable, eq(memberProfilesTable.userId, usersTable.id))
    .leftJoin(memberRolesTable, eq(memberRolesTable.userId, usersTable.id))
    .orderBy(desc(usersTable.createdAt));

  const records = await Promise.all(
    rows.map((row) =>
      roleRecord(
        row.user,
        row.profile,
        roleForUser(row.user, row.role),
      ),
    ),
  );
  res.json(GetMemberRolesResponse.parse(records));
});

router.patch("/members/roles/:userId", async (req, res): Promise<void> => {
  if (!ownerOnly(req, res)) return;
  const params = UpdateMemberRoleParams.safeParse(req.params);
  const body = UpdateMemberRoleBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Choose member, moderator, or admin." });
    return;
  }
  const targetUser = await userById(params.data.userId);
  if (!targetUser) {
    res.status(404).json({ error: "Member not found." });
    return;
  }
  if (isGsixOwner(targetUser)) {
    res.status(400).json({ error: "Owner access is managed by the owner allowlist." });
    return;
  }

  const previousRole = (await getStoredRole(targetUser.id)) ?? "member";
  await db
    .insert(memberRolesTable)
    .values({
      userId: targetUser.id,
      role: body.data.role,
      grantedBy: req.user.id,
    })
    .onConflictDoUpdate({
      target: memberRolesTable.userId,
      set: {
        role: body.data.role,
        grantedBy: req.user.id,
        updatedAt: new Date(),
      },
    });
  await db.insert(memberRoleAuditTable).values({
    userId: targetUser.id,
    actorUserId: req.user.id,
    previousRole,
    nextRole: body.data.role,
  });

  const profile = await ensureMemberProfile(targetUser);
  res.json(
    UpdateMemberRoleResponse.parse(
      await roleRecord(targetUser, profile, body.data.role),
    ),
  );
});

router.get("/members/:userId", async (req, res): Promise<void> => {
  const params = GetMemberPublicProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Member not found." });
    return;
  }
  const user = await userById(params.data.userId);
  if (!user) {
    res.status(404).json({ error: "Member not found." });
    return;
  }
  const profile = await ensureMemberProfile(user);
  res.json(GetMemberPublicProfileResponse.parse(toPublicProfile(user, profile)));
});

export default router;