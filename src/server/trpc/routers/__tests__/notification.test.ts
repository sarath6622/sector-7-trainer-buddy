import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { z } from 'zod';
import type { UserRole } from '@/generated/prisma/enums';

// ── Mock Prisma so tests never hit the real database ──────────────────────────

const mockDb = {
  notification: {
    findMany: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
};

type TestContext = {
  session: { user: { id: string; role: UserRole; email: string }; expires: string } | null;
  db: typeof mockDb;
};

const t = initTRPC.context<TestContext>().create({ transformer: superjson });

const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { session: ctx.session, db: ctx.db } });
});

const protectedProcedure = t.procedure.use(isAuthed);

// ── Inline notification router logic for test isolation ───────────────────────

const testRouter = t.router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20), cursor: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const { limit, cursor } = input;
      const notifications = await ctx.db.notification.findMany({
        where: { userId: ctx.session.user.id },
        take: limit + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
        orderBy: { createdAt: 'desc' },
      });

      let nextCursor: string | undefined;
      if (notifications.length > limit) {
        const next = notifications.pop();
        nextCursor = next?.id;
      }

      return { notifications, nextCursor };
    }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.notification.count({
      where: { userId: ctx.session.user.id, isRead: false },
    });
  }),

  markRead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.notification.update({
        where: { id: input.id, userId: ctx.session.user.id },
        data: { isRead: true, readAt: new Date() },
      });
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    return ctx.db.notification.updateMany({
      where: { userId: ctx.session.user.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }),
});

const makeContext = (role: UserRole | null, userId = 'user-1'): TestContext => ({
  session: role
    ? { user: { id: userId, role, email: 'test@test.com' }, expires: '2099' }
    : null,
  db: mockDb,
});

const makeCaller = (role: UserRole | null, userId = 'user-1') =>
  t.createCallerFactory(testRouter)(makeContext(role, userId));

beforeEach(() => vi.clearAllMocks());

// ── list ──────────────────────────────────────────────────────────────────────

describe('notification.list', () => {
  it('returns notifications for the calling user', async () => {
    const notifs = [
      { id: 'n1', type: 'ACHIEVEMENT', title: '🔥 7-Day Streak!', message: 'Keep it up', isRead: false, createdAt: new Date() },
      { id: 'n2', type: 'PROGRAM_ASSIGNED', title: 'Workout Assigned', message: 'Trainer assigned a workout', isRead: true, createdAt: new Date() },
    ];
    mockDb.notification.findMany.mockResolvedValue(notifs);

    const result = await makeCaller('CLIENT').list({ limit: 20 });

    expect(result.notifications).toHaveLength(2);
    expect(result.nextCursor).toBeUndefined();
  });

  it('sets nextCursor when there are more results than limit', async () => {
    // Returns limit+1 items to signal there is a next page
    const notifs = Array.from({ length: 3 }, (_, i) => ({
      id: `n${i}`,
      type: 'ACHIEVEMENT',
      title: 'Title',
      message: 'Msg',
      isRead: false,
      createdAt: new Date(),
    }));
    mockDb.notification.findMany.mockResolvedValue(notifs);

    const result = await makeCaller('CLIENT').list({ limit: 2 });

    expect(result.notifications).toHaveLength(2);
    expect(result.nextCursor).toBe('n2');
  });

  it('throws UNAUTHORIZED when unauthenticated', async () => {
    await expect(makeCaller(null).list({ limit: 20 })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

// ── unreadCount ───────────────────────────────────────────────────────────────

describe('notification.unreadCount', () => {
  it('returns the count of unread notifications for the calling user', async () => {
    mockDb.notification.count.mockResolvedValue(5);

    const count = await makeCaller('CLIENT').unreadCount();

    expect(count).toBe(5);
    expect(mockDb.notification.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', isRead: false } }),
    );
  });

  it('returns 0 when all notifications are read', async () => {
    mockDb.notification.count.mockResolvedValue(0);

    const count = await makeCaller('TRAINER').unreadCount();

    expect(count).toBe(0);
  });

  it('throws UNAUTHORIZED when unauthenticated', async () => {
    await expect(makeCaller(null).unreadCount()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

// ── markRead ──────────────────────────────────────────────────────────────────

describe('notification.markRead', () => {
  it('marks a single notification as read', async () => {
    mockDb.notification.update.mockResolvedValue({ id: 'n1', isRead: true });

    const result = await makeCaller('CLIENT').markRead({ id: 'n1' });

    expect(result.isRead).toBe(true);
    expect(mockDb.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'n1', userId: 'user-1' },
        data: expect.objectContaining({ isRead: true }),
      }),
    );
  });

  it('throws UNAUTHORIZED when unauthenticated', async () => {
    await expect(makeCaller(null).markRead({ id: 'n1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

// ── markAllRead ───────────────────────────────────────────────────────────────

describe('notification.markAllRead', () => {
  it('marks all unread notifications as read for the calling user', async () => {
    mockDb.notification.updateMany.mockResolvedValue({ count: 4 });

    const result = await makeCaller('CLIENT').markAllRead();

    expect(result.count).toBe(4);
    expect(mockDb.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', isRead: false },
        data: expect.objectContaining({ isRead: true }),
      }),
    );
  });

  it('returns count: 0 when there are no unread notifications', async () => {
    mockDb.notification.updateMany.mockResolvedValue({ count: 0 });

    const result = await makeCaller('ADMIN').markAllRead();

    expect(result.count).toBe(0);
  });

  it('throws UNAUTHORIZED when unauthenticated', async () => {
    await expect(makeCaller(null).markAllRead()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});
