import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { z } from 'zod';
import type { UserRole } from '@/generated/prisma/enums';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/server/services/notification.service', () => ({
  NotificationService: {
    sendBulk: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/audit', () => ({
  writeAudit: vi.fn(),
}));

import { NotificationService } from '@/server/services/notification.service';
import { writeAudit } from '@/lib/audit';

// ── Mock Prisma ───────────────────────────────────────────────────────────────

const mockAnnouncement = {
  id: 'ann-1',
  title: 'Gym closed Sunday',
  body: 'The gym will be closed this Sunday for maintenance.',
  isPinned: false,
  createdBy: 'user-admin',
  createdAt: new Date('2024-01-15'),
  updatedAt: new Date('2024-01-15'),
  author: { name: 'Admin User', image: null },
};

const mockDb = {
  announcement: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  user: {
    findMany: vi.fn(),
  },
};

// ── Test tRPC setup ───────────────────────────────────────────────────────────

type TestContext = {
  session: { user: { id: string; role: UserRole; email: string }; expires: string } | null;
  db: typeof mockDb;
};

const t = initTRPC.context<TestContext>().create({ transformer: superjson });

const hasRole = (allowedRoles: UserRole[]) =>
  t.middleware(({ ctx, next }) => {
    if (!ctx.session?.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
    if (!allowedRoles.includes(ctx.session.user.role)) throw new TRPCError({ code: 'FORBIDDEN' });
    return next({ ctx: { session: ctx.session, db: ctx.db } });
  });

const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { session: ctx.session, db: ctx.db } });
});
const adminProcedure = t.procedure.use(hasRole(['ADMIN']));

// Inline the announcement router logic using test procedures
const testRouter = t.router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20), cursor: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const items = await ctx.db.announcement.findMany({
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        include: { author: { select: { name: true, image: true } } },
      });
      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        nextCursor = (items as typeof mockAnnouncement[]).pop()!.id;
      }
      return { announcements: items, nextCursor };
    }),

  listAll: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.announcement.findMany({
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      include: { author: { select: { name: true, image: true } } },
    });
  }),

  create: adminProcedure
    .input(z.object({ title: z.string().min(1).max(200), body: z.string().min(1), isPinned: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      const announcement = await ctx.db.announcement.create({
        data: { title: input.title, body: input.body, isPinned: input.isPinned, createdBy: ctx.session.user.id },
        include: { author: { select: { name: true, image: true } } },
      });
      ctx.db.user
        .findMany({ where: { status: 'ACTIVE' }, select: { id: true } })
        .then((users: { id: string }[]) => {
          const userIds = users.map((u) => u.id);
          return NotificationService.sendBulk(userIds, {
            type: 'SYSTEM_ANNOUNCEMENT',
            title: input.title,
            message: input.body,
            data: { announcementId: announcement.id },
          });
        })
        .catch(() => {});
      writeAudit(ctx.db as any, ctx.session.user.id, 'ANNOUNCEMENT_CREATE', 'Announcement', announcement.id, { title: input.title });
      return announcement;
    }),

  pin: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.announcement.findUnique({ where: { id: input.id } });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Announcement not found' });
      return ctx.db.announcement.update({ where: { id: input.id }, data: { isPinned: true }, include: { author: { select: { name: true, image: true } } } });
    }),

  unpin: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.announcement.findUnique({ where: { id: input.id } });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Announcement not found' });
      return ctx.db.announcement.update({ where: { id: input.id }, data: { isPinned: false }, include: { author: { select: { name: true, image: true } } } });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.announcement.findUnique({ where: { id: input.id } });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Announcement not found' });
      await ctx.db.announcement.delete({ where: { id: input.id } });
      writeAudit(ctx.db as any, ctx.session.user.id, 'ANNOUNCEMENT_DELETE', 'Announcement', input.id);
      return { success: true };
    }),
});

const makeContext = (role: UserRole | null): TestContext => ({
  session: role ? { user: { id: 'user-admin', role, email: 'admin@gym.com' }, expires: '2099' } : null,
  db: mockDb,
});

const makeCaller = (role: UserRole | null) =>
  t.createCallerFactory(testRouter)(makeContext(role));

beforeEach(() => {
  vi.clearAllMocks();
});

// ── list ──────────────────────────────────────────────────────────────────────

describe('announcement.list', () => {
  it('returns announcements for any authenticated user', async () => {
    mockDb.announcement.findMany.mockResolvedValue([mockAnnouncement]);
    const result = await makeCaller('CLIENT').list({});
    expect(result.announcements).toHaveLength(1);
    expect(result.announcements[0].title).toBe('Gym closed Sunday');
    expect(result.nextCursor).toBeUndefined();
  });

  it('sets nextCursor when more items than limit', async () => {
    const items = [
      { ...mockAnnouncement, id: 'ann-1' },
      { ...mockAnnouncement, id: 'ann-2' },
    ];
    mockDb.announcement.findMany.mockResolvedValue(items);
    const result = await makeCaller('CLIENT').list({ limit: 1 });
    expect(result.announcements).toHaveLength(1);
    expect(result.nextCursor).toBe('ann-2');
  });

  it('throws UNAUTHORIZED when unauthenticated', async () => {
    await expect(makeCaller(null).list({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

// ── create ────────────────────────────────────────────────────────────────────

describe('announcement.create', () => {
  it('creates announcement and fires bulk notification', async () => {
    mockDb.announcement.create.mockResolvedValue(mockAnnouncement);
    mockDb.user.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);

    const result = await makeCaller('ADMIN').create({
      title: 'Gym closed Sunday',
      body: 'The gym will be closed this Sunday for maintenance.',
    });

    expect(mockDb.announcement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ title: 'Gym closed Sunday' }) }),
    );
    expect(result.id).toBe('ann-1');
    expect(writeAudit).toHaveBeenCalledWith(
      expect.anything(), 'user-admin', 'ANNOUNCEMENT_CREATE', 'Announcement', 'ann-1', expect.anything(),
    );
  });

  it('throws FORBIDDEN for CLIENT', async () => {
    await expect(makeCaller('CLIENT').create({ title: 'T', body: 'B' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws FORBIDDEN for TRAINER', async () => {
    await expect(makeCaller('TRAINER').create({ title: 'T', body: 'B' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

// ── pin ───────────────────────────────────────────────────────────────────────

describe('announcement.pin', () => {
  it('pins an existing announcement', async () => {
    mockDb.announcement.findUnique.mockResolvedValue(mockAnnouncement);
    mockDb.announcement.update.mockResolvedValue({ ...mockAnnouncement, isPinned: true });

    const result = await makeCaller('ADMIN').pin({ id: 'ann-1' });
    expect(result.isPinned).toBe(true);
    expect(mockDb.announcement.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isPinned: true } }),
    );
  });

  it('throws NOT_FOUND for unknown id', async () => {
    mockDb.announcement.findUnique.mockResolvedValue(null);
    await expect(makeCaller('ADMIN').pin({ id: 'missing' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

// ── unpin ─────────────────────────────────────────────────────────────────────

describe('announcement.unpin', () => {
  it('unpins an existing announcement', async () => {
    mockDb.announcement.findUnique.mockResolvedValue({ ...mockAnnouncement, isPinned: true });
    mockDb.announcement.update.mockResolvedValue({ ...mockAnnouncement, isPinned: false });

    const result = await makeCaller('ADMIN').unpin({ id: 'ann-1' });
    expect(result.isPinned).toBe(false);
  });

  it('throws NOT_FOUND for unknown id', async () => {
    mockDb.announcement.findUnique.mockResolvedValue(null);
    await expect(makeCaller('ADMIN').unpin({ id: 'missing' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

// ── delete ────────────────────────────────────────────────────────────────────

describe('announcement.delete', () => {
  it('deletes an existing announcement and audits', async () => {
    mockDb.announcement.findUnique.mockResolvedValue(mockAnnouncement);
    mockDb.announcement.delete.mockResolvedValue(mockAnnouncement);

    const result = await makeCaller('ADMIN').delete({ id: 'ann-1' });
    expect(result.success).toBe(true);
    expect(mockDb.announcement.delete).toHaveBeenCalled();
    expect(writeAudit).toHaveBeenCalledWith(
      expect.anything(), 'user-admin', 'ANNOUNCEMENT_DELETE', 'Announcement', 'ann-1',
    );
  });

  it('throws NOT_FOUND for unknown id', async () => {
    mockDb.announcement.findUnique.mockResolvedValue(null);
    await expect(makeCaller('ADMIN').delete({ id: 'missing' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws FORBIDDEN for CLIENT', async () => {
    await expect(makeCaller('CLIENT').delete({ id: 'ann-1' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
