import {
  CreateForumReplyBody,
  CreateForumReplyParams,
  CreateForumReplyResponse,
  CreateForumReportBody,
  CreateForumReportResponse,
  CreateForumThreadBody,
  CreateForumThreadResponse,
  DeleteForumReplyParams,
  DeleteForumThreadParams,
  GetForumCategoriesResponse,
  GetForumThreadDetailParams,
  GetForumThreadDetailQueryParams,
  GetForumThreadDetailResponse,
  ListForumCategoryThreadsParams,
  ListForumCategoryThreadsQueryParams,
  ListForumCategoryThreadsResponse,
  ListForumModerationReportsQueryParams,
  ListForumModerationReportsResponse,
  ModerateForumReplyBody,
  ModerateForumReplyParams,
  ModerateForumReplyResponse,
  ModerateForumThreadBody,
  ModerateForumThreadParams,
  ModerateForumThreadResponse,
  ResolveForumReportBody,
  ResolveForumReportParams,
  ResolveForumReportResponse,
  UpdateForumReplyBody,
  UpdateForumReplyParams,
  UpdateForumReplyResponse,
  UpdateForumThreadBody,
  UpdateForumThreadParams,
  UpdateForumThreadResponse,
} from "@workspace/api-zod";
import {
  forumActivityEventsTable,
  forumCategoriesTable,
  forumModerationAuditTable,
  forumRepliesTable,
  forumReportsTable,
  forumThreadsTable,
  db,
  memberProfilesTable,
  usersTable,
} from "@workspace/db";
import { count, desc, eq, and, asc } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { ensureMemberProfile, getBadge, roleForUser, getStoredRole, BADGE_CATALOG } from "../lib/members";
import {
  canModerate,
  cleanForumText,
  ensureForumCategories,
  forumExcerpt,
  isWithinForumEditWindow,
  rateLimitForumAction,
  approveForumActivity,
} from "../lib/forum";
import { recordMemberActivity } from "../lib/leaderboard";

const router: IRouter = Router();
const REPLY_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const PUBLIC_STATUSES = ["published"] as const;

type UserRow = typeof usersTable.$inferSelect;
type ProfileRow = typeof memberProfilesTable.$inferSelect;

function publicBadge(slug: string) {
  return getBadge(slug) ?? BADGE_CATALOG[0];
}

async function authorFor(user: UserRow, profile?: ProfileRow | null) {
  const member = profile ?? (await ensureMemberProfile(user));
  return {
    userId: user.id,
    displayName: member.displayName,
    badge: publicBadge(member.badgeSlug),
  };
}

function pagination(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) };
}

function authRequired(req: Request, res: Response): req is Request & { user: NonNullable<Request["user"]> } {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Sign in to participate in the forum." });
    return false;
  }
  return true;
}

async function moderatorOnly(req: Request, res: Response): Promise<boolean> {
  if (!authRequired(req, res)) return false;
  const role = roleForUser(req.user, await getStoredRole(req.user.id));
  if (!canModerate(role)) {
    res.status(403).json({ error: "Moderator access is required." });
    return false;
  }
  return true;
}

function rateLimited(req: Request, res: Response, action: string, limit: number): boolean {
  const result = rateLimitForumAction(`${req.user?.id ?? "anonymous"}:${action}`, limit, 60_000);
  if (result.allowed) return false;
  res.setHeader("Retry-After", result.retryAfterSeconds);
  res.status(429).json({ error: `Slow down and try again in ${result.retryAfterSeconds} seconds.` });
  return true;
}

function publicThreadSummary(
  row: {
    thread: typeof forumThreadsTable.$inferSelect;
    category: typeof forumCategoriesTable.$inferSelect;
    user: UserRow;
    profile: ProfileRow | null;
  },
  author: ReturnType<typeof authorFor> extends Promise<infer T> ? T : never,
  replyCount: number,
) {
  return {
    id: row.thread.id,
    categorySlug: row.category.slug,
    title: row.thread.title,
    excerpt: forumExcerpt(row.thread.content),
    author,
    replyCount,
    isPinned: row.thread.isPinned,
    isLocked: row.thread.isLocked,
    createdAt: row.thread.createdAt,
    lastActivityAt: row.thread.lastActivityAt,
  };
}

async function findThreadRow(threadId: number, includeHidden = false) {
  const conditions = includeHidden
    ? eq(forumThreadsTable.id, threadId)
    : and(eq(forumThreadsTable.id, threadId), eq(forumThreadsTable.status, "published"));
  const [row] = await db
    .select({
      thread: forumThreadsTable,
      category: forumCategoriesTable,
      user: usersTable,
      profile: memberProfilesTable,
    })
    .from(forumThreadsTable)
    .innerJoin(forumCategoriesTable, eq(forumThreadsTable.categoryId, forumCategoriesTable.id))
    .innerJoin(usersTable, eq(forumThreadsTable.authorUserId, usersTable.id))
    .leftJoin(memberProfilesTable, eq(forumThreadsTable.authorUserId, memberProfilesTable.userId))
    .where(conditions);
  return row;
}

async function findReplyRow(replyId: number, includeHidden = false) {
  const conditions = includeHidden
    ? eq(forumRepliesTable.id, replyId)
    : and(eq(forumRepliesTable.id, replyId), eq(forumRepliesTable.status, "published"));
  const [row] = await db
    .select({
      reply: forumRepliesTable,
      user: usersTable,
      profile: memberProfilesTable,
    })
    .from(forumRepliesTable)
    .innerJoin(usersTable, eq(forumRepliesTable.authorUserId, usersTable.id))
    .leftJoin(memberProfilesTable, eq(forumRepliesTable.authorUserId, memberProfilesTable.userId))
    .where(conditions);
  return row;
}

async function threadDetail(threadId: number, viewerId?: string, includeHidden = false, replyPage = 1, pageSize = REPLY_PAGE_SIZE) {
  const row = await findThreadRow(threadId, includeHidden);
  if (!row) return null;

  const author = await authorFor(row.user, row.profile);
  const [replyCountRow] = await db
    .select({ count: count() })
    .from(forumRepliesTable)
    .where(and(eq(forumRepliesTable.threadId, threadId), eq(forumRepliesTable.status, "published")));
  const total = Number(replyCountRow?.count ?? 0);
  const [rows, replyRows] = await Promise.all([
    db
      .select({
        reply: forumRepliesTable,
        user: usersTable,
        profile: memberProfilesTable,
      })
      .from(forumRepliesTable)
      .innerJoin(usersTable, eq(forumRepliesTable.authorUserId, usersTable.id))
      .leftJoin(memberProfilesTable, eq(forumRepliesTable.authorUserId, memberProfilesTable.userId))
      .where(and(eq(forumRepliesTable.threadId, threadId), eq(forumRepliesTable.status, "published")))
      .orderBy(asc(forumRepliesTable.createdAt), asc(forumRepliesTable.id))
      .limit(pageSize)
      .offset((replyPage - 1) * pageSize),
    db
      .select({ reply: forumRepliesTable })
      .from(forumRepliesTable)
      .where(and(eq(forumRepliesTable.threadId, threadId), eq(forumRepliesTable.status, "published"))),
  ]);
  const replies = await Promise.all(rows.map(async (replyRow) => ({
    id: replyRow.reply.id,
    threadId: replyRow.reply.threadId,
    content: replyRow.reply.content,
    author: await authorFor(replyRow.user, replyRow.profile),
    canEdit: viewerId === replyRow.reply.authorUserId && isWithinForumEditWindow(replyRow.reply.createdAt),
    canRemove: viewerId === replyRow.reply.authorUserId && isWithinForumEditWindow(replyRow.reply.createdAt),
    createdAt: replyRow.reply.createdAt,
    updatedAt: replyRow.reply.updatedAt,
  })));
  return {
    thread: {
      ...publicThreadSummary(row, author, total),
      content: row.thread.content,
      canEdit: viewerId === row.thread.authorUserId && isWithinForumEditWindow(row.thread.createdAt),
      canRemove: viewerId === row.thread.authorUserId && isWithinForumEditWindow(row.thread.createdAt),
    },
    replies,
    pagination: pagination(replyPage, pageSize, Number(replyRows.length)),
  };
}

async function replyResponse(replyId: number, viewerId?: string, includeHidden = false) {
  const row = await findReplyRow(replyId, includeHidden);
  if (!row) return null;
  return {
    id: row.reply.id,
    threadId: row.reply.threadId,
    content: row.reply.content,
    author: await authorFor(row.user, row.profile),
    canEdit: viewerId === row.reply.authorUserId && isWithinForumEditWindow(row.reply.createdAt),
    canRemove: viewerId === row.reply.authorUserId && isWithinForumEditWindow(row.reply.createdAt),
    createdAt: row.reply.createdAt,
    updatedAt: row.reply.updatedAt,
  };
}

router.get("/forum/categories", async (_req, res): Promise<void> => {
  const categories = await ensureForumCategories(db);
  const result = await Promise.all(categories.map(async (category) => {
    const [row] = await db
      .select({ count: count() })
      .from(forumThreadsTable)
      .where(and(eq(forumThreadsTable.categoryId, category.id), eq(forumThreadsTable.status, "published")));
    return { ...category, threadCount: Number(row?.count ?? 0) };
  }));
  res.json(GetForumCategoriesResponse.parse(result));
});

router.get("/forum/categories/:slug/threads", async (req, res): Promise<void> => {
  const params = ListForumCategoryThreadsParams.safeParse(req.params);
  const query = ListForumCategoryThreadsQueryParams.safeParse(req.query);
  if (!params.success || !query.success) {
    res.status(400).json({ error: "Invalid forum pagination." });
    return;
  }
  const page = query.data.page;
  const pageSize = Math.min(query.data.pageSize, MAX_PAGE_SIZE);
  const [category] = await db.select().from(forumCategoriesTable).where(eq(forumCategoriesTable.slug, params.data.slug));
  if (!category) {
    res.status(404).json({ error: "Forum category not found." });
    return;
  }
  const where = and(eq(forumThreadsTable.categoryId, category.id), eq(forumThreadsTable.status, PUBLIC_STATUSES[0]));
  const [countRow, rows] = await Promise.all([
    db.select({ count: count() }).from(forumThreadsTable).where(where),
    db
      .select({ thread: forumThreadsTable, category: forumCategoriesTable, user: usersTable, profile: memberProfilesTable })
      .from(forumThreadsTable)
      .innerJoin(forumCategoriesTable, eq(forumThreadsTable.categoryId, forumCategoriesTable.id))
      .innerJoin(usersTable, eq(forumThreadsTable.authorUserId, usersTable.id))
      .leftJoin(memberProfilesTable, eq(forumThreadsTable.authorUserId, memberProfilesTable.userId))
      .where(where)
      .orderBy(desc(forumThreadsTable.isPinned), desc(forumThreadsTable.lastActivityAt), desc(forumThreadsTable.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);
  const total = Number(countRow[0]?.count ?? 0);
  const items = await Promise.all(rows.map(async (row) => {
    const [replyCountRow] = await db
      .select({ count: count() })
      .from(forumRepliesTable)
      .where(and(eq(forumRepliesTable.threadId, row.thread.id), eq(forumRepliesTable.status, "published")));
    return publicThreadSummary(row, await authorFor(row.user, row.profile), Number(replyCountRow?.count ?? 0));
  }));
  res.json(ListForumCategoryThreadsResponse.parse({ category: { ...category, threadCount: total }, items, pagination: pagination(page, pageSize, total) }));
});

router.get("/forum/thread/:id", async (req, res): Promise<void> => {
  const params = GetForumThreadDetailParams.safeParse(req.params);
  const query = GetForumThreadDetailQueryParams.safeParse(req.query);
  if (!params.success || !query.success) {
    res.status(400).json({ error: "Invalid forum thread request." });
    return;
  }
  const result = await threadDetail(params.data.id, req.isAuthenticated() ? req.user.id : undefined, false, query.data.replyPage, Math.min(query.data.pageSize, MAX_PAGE_SIZE));
  if (!result) {
    res.status(404).json({ error: "Forum thread not found." });
    return;
  }
  res.json(GetForumThreadDetailResponse.parse(result));
});

router.post("/forum/threads", async (req, res): Promise<void> => {
  if (!authRequired(req, res)) return;
  const body = CreateForumThreadBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Thread titles must be 4–120 characters and posts 10–5000 characters." });
    return;
  }
  if (rateLimited(req, res, "thread", 3)) return;
  const title = cleanForumText(body.data.title);
  const content = cleanForumText(body.data.content);
  if (title.length < 4 || content.length < 10) {
    res.status(400).json({ error: "Thread titles must be 4–120 characters and posts 10–5000 characters." });
    return;
  }
  const [category] = await db.select().from(forumCategoriesTable).where(eq(forumCategoriesTable.slug, body.data.categorySlug));
  if (!category) {
    res.status(404).json({ error: "Forum category not found." });
    return;
  }
  const [created] = await db
    .insert(forumThreadsTable)
    .values({ categoryId: category.id, authorUserId: req.user!.id, title, content })
    .returning();
  if (!created) {
    res.status(400).json({ error: "The thread could not be created." });
    return;
  }
  await db.insert(forumActivityEventsTable).values({
    eventType: "thread_created",
    actorUserId: req.user!.id,
    categoryId: category.id,
    threadId: created.id,
    isApproved: true,
  });
  await recordMemberActivity(req.user!.id);
  const result = await threadDetail(created.id, req.user!.id, true, 1, REPLY_PAGE_SIZE);
  res.status(201).json(CreateForumThreadResponse.parse(result));
});

router.post("/forum/threads/:id/replies", async (req, res): Promise<void> => {
  if (!authRequired(req, res)) return;
  const params = CreateForumReplyParams.safeParse(req.params);
  const body = CreateForumReplyBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Replies must be between 2 and 3000 characters." });
    return;
  }
  if (rateLimited(req, res, "reply", 10)) return;
  const content = cleanForumText(body.data.content);
  if (content.length < 2) {
    res.status(400).json({ error: "Replies must be between 2 and 3000 characters." });
    return;
  }
  const [thread] = await db.select().from(forumThreadsTable).where(and(eq(forumThreadsTable.id, params.data.id), eq(forumThreadsTable.status, "published")));
  if (!thread) {
    res.status(404).json({ error: "Forum thread not found." });
    return;
  }
  if (thread.isLocked) {
    res.status(409).json({ error: "This thread is locked." });
    return;
  }
  const [created] = await db.insert(forumRepliesTable).values({ threadId: thread.id, authorUserId: req.user!.id, content }).returning();
  await db.update(forumThreadsTable).set({ lastActivityAt: new Date(), updatedAt: new Date() }).where(eq(forumThreadsTable.id, thread.id));
  await db.insert(forumActivityEventsTable).values({
    eventType: "reply_created",
    actorUserId: req.user!.id,
    threadId: thread.id,
    replyId: created.id,
    isApproved: true,
  });
  await recordMemberActivity(req.user!.id);
  const result = await replyResponse(created.id, req.user!.id, true);
  res.status(201).json(CreateForumReplyResponse.parse(result));
});

router.patch("/forum/threads/:id", async (req, res): Promise<void> => {
  if (!authRequired(req, res)) return;
  const params = UpdateForumThreadParams.safeParse(req.params);
  const body = UpdateForumThreadBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Choose a valid title, post, or remove action." });
    return;
  }
  const [thread] = await db.select().from(forumThreadsTable).where(eq(forumThreadsTable.id, params.data.id));
  if (!thread) {
    res.status(404).json({ error: "Forum thread not found." });
    return;
  }
  if (thread.authorUserId !== req.user!.id || !isWithinForumEditWindow(thread.createdAt)) {
    res.status(403).json({ error: "Your thread can only be edited or removed for 30 minutes." });
    return;
  }
  const title = body.data.title ? cleanForumText(body.data.title) : undefined;
  const content = body.data.content ? cleanForumText(body.data.content) : undefined;
  if ((title != null && title.length < 4) || (content != null && content.length < 10)) {
    res.status(400).json({ error: "Thread titles must be 4–120 characters and posts 10–5000 characters." });
    return;
  }
  if (body.data.remove) {
    await db.update(forumThreadsTable).set({ status: "removed", updatedAt: new Date() }).where(eq(forumThreadsTable.id, thread.id));
    await approveForumActivity(db, { threadId: thread.id }, false);
  } else if (!title && !content) {
    res.status(400).json({ error: "Choose a valid title, post, or remove action." });
    return;
  } else {
    await db.update(forumThreadsTable).set({ ...(title ? { title } : {}), ...(content ? { content } : {}), updatedAt: new Date() }).where(eq(forumThreadsTable.id, thread.id));
  }
  const result = await threadDetail(thread.id, req.user!.id, true, 1, REPLY_PAGE_SIZE);
  res.json(UpdateForumThreadResponse.parse(result));
});

router.delete("/forum/threads/:id", async (req, res): Promise<void> => {
  if (!authRequired(req, res)) return;
  const params = DeleteForumThreadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid forum thread." });
    return;
  }
  const [thread] = await db.select().from(forumThreadsTable).where(eq(forumThreadsTable.id, params.data.id));
  if (!thread) {
    res.status(404).json({ error: "Forum thread not found." });
    return;
  }
  if (thread.authorUserId !== req.user!.id || !isWithinForumEditWindow(thread.createdAt)) {
    res.status(403).json({ error: "Your thread can only be edited or removed for 30 minutes." });
    return;
  }
  await db.update(forumThreadsTable).set({ status: "removed", updatedAt: new Date() }).where(eq(forumThreadsTable.id, thread.id));
  await approveForumActivity(db, { threadId: thread.id }, false);
  res.sendStatus(204);
});

router.patch("/forum/replies/:id", async (req, res): Promise<void> => {
  if (!authRequired(req, res)) return;
  const params = UpdateForumReplyParams.safeParse(req.params);
  const body = UpdateForumReplyBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Choose valid reply content or remove action." });
    return;
  }
  const [reply] = await db.select().from(forumRepliesTable).where(eq(forumRepliesTable.id, params.data.id));
  if (!reply) {
    res.status(404).json({ error: "Forum reply not found." });
    return;
  }
  if (reply.authorUserId !== req.user!.id || !isWithinForumEditWindow(reply.createdAt)) {
    res.status(403).json({ error: "Your reply can only be edited or removed for 30 minutes." });
    return;
  }
  if (body.data.remove) {
    await db.update(forumRepliesTable).set({ status: "removed", updatedAt: new Date() }).where(eq(forumRepliesTable.id, reply.id));
    await approveForumActivity(db, { replyId: reply.id }, false);
  } else {
    const content = body.data.content ? cleanForumText(body.data.content) : "";
    if (content.length < 2) {
      res.status(400).json({ error: "Replies must be between 2 and 3000 characters." });
      return;
    }
    await db.update(forumRepliesTable).set({ content, updatedAt: new Date() }).where(eq(forumRepliesTable.id, reply.id));
  }
  const result = await replyResponse(reply.id, req.user!.id, true);
  res.json(UpdateForumReplyResponse.parse(result));
});

router.delete("/forum/replies/:id", async (req, res): Promise<void> => {
  if (!authRequired(req, res)) return;
  const params = DeleteForumReplyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid forum reply." });
    return;
  }
  const [reply] = await db.select().from(forumRepliesTable).where(eq(forumRepliesTable.id, params.data.id));
  if (!reply) {
    res.status(404).json({ error: "Forum reply not found." });
    return;
  }
  if (reply.authorUserId !== req.user!.id || !isWithinForumEditWindow(reply.createdAt)) {
    res.status(403).json({ error: "Your reply can only be edited or removed for 30 minutes." });
    return;
  }
  await db.update(forumRepliesTable).set({ status: "removed", updatedAt: new Date() }).where(eq(forumRepliesTable.id, reply.id));
  await approveForumActivity(db, { replyId: reply.id }, false);
  res.sendStatus(204);
});

router.post("/forum/reports", async (req, res): Promise<void> => {
  if (!authRequired(req, res)) return;
  const body = CreateForumReportBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Reports must include a reason of 10–500 characters." });
    return;
  }
  if (rateLimited(req, res, "report", 5)) return;
  const reason = cleanForumText(body.data.reason);
  if (reason.length < 10) {
    res.status(400).json({ error: "Reports must include a reason of 10–500 characters." });
    return;
  }
  const target = body.data.targetType === "thread"
    ? await db.select({ id: forumThreadsTable.id }).from(forumThreadsTable).where(eq(forumThreadsTable.id, body.data.targetId))
    : await db.select({ id: forumRepliesTable.id }).from(forumRepliesTable).where(eq(forumRepliesTable.id, body.data.targetId));
  if (!target[0]) {
    res.status(404).json({ error: "Forum content not found." });
    return;
  }
  const duplicate = await db
    .select({ id: forumReportsTable.id })
    .from(forumReportsTable)
    .where(and(
      eq(forumReportsTable.reporterUserId, req.user!.id),
      eq(forumReportsTable.status, "pending"),
      body.data.targetType === "thread" ? eq(forumReportsTable.threadId, body.data.targetId) : eq(forumReportsTable.replyId, body.data.targetId),
    ));
  if (duplicate[0]) {
    res.status(201).json(CreateForumReportResponse.parse({ received: true, message: "Your report is already in the moderation queue." }));
    return;
  }
  await db.insert(forumReportsTable).values({
    reporterUserId: req.user!.id,
    threadId: body.data.targetType === "thread" ? body.data.targetId : null,
    replyId: body.data.targetType === "reply" ? body.data.targetId : null,
    reason,
  });
  res.status(201).json(CreateForumReportResponse.parse({ received: true, message: "Thanks. Your report is in the moderation queue." }));
});

router.get("/forum/moderation/reports", async (req, res): Promise<void> => {
  if (!await moderatorOnly(req, res)) return;
  const query = ListForumModerationReportsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid moderation pagination." });
    return;
  }
  const pageSize = Math.min(query.data.pageSize, MAX_PAGE_SIZE);
  const [countRows, rows] = await Promise.all([
    db.select({ count: count() }).from(forumReportsTable),
    db
      .select({ report: forumReportsTable, user: usersTable, profile: memberProfilesTable })
      .from(forumReportsTable)
      .innerJoin(usersTable, eq(forumReportsTable.reporterUserId, usersTable.id))
      .leftJoin(memberProfilesTable, eq(forumReportsTable.reporterUserId, memberProfilesTable.userId))
      .orderBy(desc(forumReportsTable.createdAt))
      .limit(pageSize)
      .offset((query.data.page - 1) * pageSize),
  ]);
  const total = Number(countRows[0]?.count ?? 0);
  const items = await Promise.all(rows.map(async ({ report, user, profile }) => ({
    id: report.id,
    targetType: report.threadId != null ? "thread" : "reply",
    targetId: report.threadId ?? report.replyId!,
    reason: report.reason,
    status: report.status,
    reporter: await authorFor(user, profile),
    createdAt: report.createdAt,
  })));
  res.json(ListForumModerationReportsResponse.parse({ items, pagination: pagination(query.data.page, pageSize, total) }));
});

router.patch("/forum/moderation/reports/:id", async (req, res): Promise<void> => {
  if (!await moderatorOnly(req, res)) return;
  const params = ResolveForumReportParams.safeParse(req.params);
  const body = ResolveForumReportBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Choose resolved or dismissed." });
    return;
  }
  const [report] = await db.select().from(forumReportsTable).where(eq(forumReportsTable.id, params.data.id));
  if (!report) {
    res.status(404).json({ error: "Forum report not found." });
    return;
  }
  const [updated] = await db
    .update(forumReportsTable)
    .set({ status: body.data.status, resolvedBy: req.user!.id, resolvedAt: new Date() })
    .where(eq(forumReportsTable.id, report.id))
    .returning();
  await db.insert(forumModerationAuditTable).values({
    actorUserId: req.user!.id,
    threadId: report.threadId,
    replyId: report.replyId,
    action: `report_${body.data.status}`,
  });
  const reporterUser = await db.select({ user: usersTable, profile: memberProfilesTable }).from(usersTable).leftJoin(memberProfilesTable, eq(usersTable.id, report.reporterUserId)).where(eq(usersTable.id, report.reporterUserId));
  const source = reporterUser[0];
  if (!updated || !source) {
    res.status(404).json({ error: "Forum report not found." });
    return;
  }
  res.json(ResolveForumReportResponse.parse({
    id: updated.id,
    targetType: updated.threadId != null ? "thread" : "reply",
    targetId: updated.threadId ?? updated.replyId!,
    reason: updated.reason,
    status: updated.status,
    reporter: await authorFor(source.user, source.profile),
    createdAt: updated.createdAt,
  }));
});

async function applyThreadModeration(req: Request, res: Response): Promise<void> {
  if (!await moderatorOnly(req, res)) return;
  const params = ModerateForumThreadParams.safeParse(req.params);
  const body = ModerateForumThreadBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Choose a valid moderation action." });
    return;
  }
  const [thread] = await db.select().from(forumThreadsTable).where(eq(forumThreadsTable.id, params.data.id));
  if (!thread) {
    res.status(404).json({ error: "Forum thread not found." });
    return;
  }
  const update: Partial<typeof forumThreadsTable.$inferInsert> = { updatedAt: new Date() };
  if (body.data.action === "hide") update.status = "hidden";
  if (body.data.action === "remove") update.status = "removed";
  if (body.data.action === "restore") update.status = "published";
  if (body.data.action === "lock") update.isLocked = true;
  if (body.data.action === "unlock") update.isLocked = false;
  if (body.data.action === "pin") update.isPinned = true;
  if (body.data.action === "unpin") update.isPinned = false;
  await db.update(forumThreadsTable).set(update).where(eq(forumThreadsTable.id, thread.id));
  await db.insert(forumModerationAuditTable).values({ actorUserId: req.user!.id, threadId: thread.id, action: body.data.action, reason: body.data.reason ?? null });
  if (body.data.action === "hide" || body.data.action === "remove") await approveForumActivity(db, { threadId: thread.id }, false);
  if (body.data.action === "restore") await approveForumActivity(db, { threadId: thread.id }, true);
  const result = await threadDetail(thread.id, req.user!.id, true, 1, REPLY_PAGE_SIZE);
  res.json(ModerateForumThreadResponse.parse(result));
}

router.patch("/forum/moderation/threads/:id", applyThreadModeration);

router.patch("/forum/moderation/replies/:id", async (req, res): Promise<void> => {
  if (!await moderatorOnly(req, res)) return;
  const params = ModerateForumReplyParams.safeParse(req.params);
  const body = ModerateForumReplyBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Choose a valid moderation action." });
    return;
  }
  if (!["hide", "remove", "restore"].includes(body.data.action)) {
    res.status(400).json({ error: "Replies support hide, remove, or restore." });
    return;
  }
  const [reply] = await db.select().from(forumRepliesTable).where(eq(forumRepliesTable.id, params.data.id));
  if (!reply) {
    res.status(404).json({ error: "Forum reply not found." });
    return;
  }
  const status = body.data.action === "restore" ? "published" : body.data.action === "hide" ? "hidden" : "removed";
  const [updated] = await db.update(forumRepliesTable).set({ status, updatedAt: new Date() }).where(eq(forumRepliesTable.id, reply.id)).returning();
  await db.insert(forumModerationAuditTable).values({ actorUserId: req.user!.id, replyId: reply.id, action: body.data.action, reason: body.data.reason ?? null });
  await approveForumActivity(db, { replyId: reply.id }, status === "published");
  res.json(ModerateForumReplyResponse.parse(await replyResponse(updated.id, req.user!.id, true)));
});

export default router;