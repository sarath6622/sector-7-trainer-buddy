import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { z } from 'zod';
import type { UserRole } from '@/generated/prisma/enums';

// ── Mock Prisma ───────────────────────────────────────────────────────────────

const mockDb = {
  auditLog: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
};

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

const adminProcedure = t.procedure.use(hasRole(['ADMIN']));

// ── Inline auditLog router (mirrors auditLog.ts logic) ───────────────────────

const testRouter = t.router({
  list: adminProcedure
    .input(
      z.object({
        userId: z.string().nullish(),
        action: z.string().nullish(),
        entity: z.string().nullish(),
        dateFrom: z.string().nullish(),
        dateTo: z.string().nullish(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(25),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { userId, action, entity, dateFrom, dateTo, page, limit } = input;

      const where = {
        ...(userId ? { userId } : {}),
        ...(action ? { action: { startsWith: action } } : {}),
        ...(entity ? { entity } : {}),
        ...(dateFrom || dateTo
          ? {
              createdAt: {
                ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
                ...(dateTo ? { lte: new Date(dateTo + 'T23:59:59.999Z') } : {}),
              },
            }
          : {}),
      };

      const [logs, total] = await Promise.all([
        ctx.db.auditLog.findMany({
          where,
          select: {
            id: true,
            action: true,
            entity: true,
            entityId: true,
            details: true,
            createdAt: true,
            user: { select: { id: true, name: true, email: true, image: true, role: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        ctx.db.auditLog.count({ where }),
      ]);

      return { logs, total, page, totalPages: Math.ceil(total / limit) };
    }),
});

const makeContext = (role: UserRole | null, userId = 'admin-1'): TestContext => ({
  session: role
    ? { user: { id: userId, role, email: 'admin@test.com' }, expires: '2099' }
    : null,
  db: mockDb,
});

const makeCaller = (role: UserRole | null) =>
  t.createCallerFactory(testRouter)(makeContext(role));

const makeLogs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `log-${i}`,
    action: 'USER_CREATE',
    entity: 'User',
    entityId: `user-${i}`,
    details: { name: `User ${i}` },
    createdAt: new Date('2026-03-01'),
    user: { id: 'admin-1', name: 'Admin', email: 'admin@test.com', image: null, role: 'ADMIN' },
  }));

beforeEach(() => vi.clearAllMocks());

// ── auditLog.list ─────────────────────────────────────────────────────────────

describe('auditLog.list', () => {
  it('returns paginated logs with correct totalPages', async () => {
    mockDb.auditLog.findMany.mockResolvedValue(makeLogs(25));
    mockDb.auditLog.count.mockResolvedValue(60);

    const result = await makeCaller('ADMIN').list({ page: 1, limit: 25 });

    expect(result.total).toBe(60);
    expect(result.totalPages).toBe(3);
    expect(result.page).toBe(1);
    expect(result.logs).toHaveLength(25);
  });

  it('returns empty list when no logs exist', async () => {
    mockDb.auditLog.findMany.mockResolvedValue([]);
    mockDb.auditLog.count.mockResolvedValue(0);

    const result = await makeCaller('ADMIN').list({});

    expect(result.logs).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });

  it('passes userId filter to db query', async () => {
    mockDb.auditLog.findMany.mockResolvedValue([]);
    mockDb.auditLog.count.mockResolvedValue(0);

    await makeCaller('ADMIN').list({ userId: 'u-123' });

    expect(mockDb.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'u-123' }) }),
    );
  });

  it('passes action startsWith filter to db query', async () => {
    mockDb.auditLog.findMany.mockResolvedValue([]);
    mockDb.auditLog.count.mockResolvedValue(0);

    await makeCaller('ADMIN').list({ action: 'USER_' });

    expect(mockDb.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ action: { startsWith: 'USER_' } }),
      }),
    );
  });

  it('passes entity filter to db query', async () => {
    mockDb.auditLog.findMany.mockResolvedValue([]);
    mockDb.auditLog.count.mockResolvedValue(0);

    await makeCaller('ADMIN').list({ entity: 'Challenge' });

    expect(mockDb.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ entity: 'Challenge' }) }),
    );
  });

  it('includes dateFrom and dateTo in createdAt filter', async () => {
    mockDb.auditLog.findMany.mockResolvedValue([]);
    mockDb.auditLog.count.mockResolvedValue(0);

    await makeCaller('ADMIN').list({ dateFrom: '2026-01-01', dateTo: '2026-01-31' });

    expect(mockDb.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.objectContaining({
            gte: new Date('2026-01-01'),
          }),
        }),
      }),
    );
  });

  it('applies correct skip for page 2', async () => {
    mockDb.auditLog.findMany.mockResolvedValue([]);
    mockDb.auditLog.count.mockResolvedValue(0);

    await makeCaller('ADMIN').list({ page: 2, limit: 10 });

    expect(mockDb.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
  });

  it('throws FORBIDDEN for TRAINER role', async () => {
    await expect(makeCaller('TRAINER').list({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws FORBIDDEN for CLIENT role', async () => {
    await expect(makeCaller('CLIENT').list({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws UNAUTHORIZED when unauthenticated', async () => {
    await expect(makeCaller(null).list({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
