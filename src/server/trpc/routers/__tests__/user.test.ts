import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import type { UserRole } from '@/generated/prisma/enums';

// ── Mock Prisma so tests never touch the real database ────────────────────────

const mockDb = {
  user: {
    count: vi.fn(),
  },
  exercise: {
    count: vi.fn(),
  },
};

// Rebuild an isolated tRPC instance to test the router logic in isolation
type TestContext = {
  session: { user: { id: string; role: UserRole; email: string }; expires: string } | null;
  db: typeof mockDb;
};

const t = initTRPC.context<TestContext>().create({ transformer: superjson });

// Mirror the authorization middleware from src/server/trpc/init.ts
const hasRole = (allowedRoles: UserRole[]) =>
  t.middleware(({ ctx, next }) => {
    if (!ctx.session?.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
    if (!allowedRoles.includes(ctx.session.user.role)) throw new TRPCError({ code: 'FORBIDDEN' });
    return next({ ctx: { session: ctx.session, db: ctx.db } });
  });

const adminProcedure = t.procedure.use(hasRole(['ADMIN']));

// Inline the relevant user router logic using our test procedures
const testRouter = t.router({
  // Single query for admin dashboard stat cards — avoids three separate round-trips
  getAdminStats: adminProcedure.query(async ({ ctx }) => {
    const [totalUsers, totalTrainers, totalExercises] = await Promise.all([
      ctx.db.user.count({ where: { role: 'CLIENT' } }),
      ctx.db.user.count({ where: { role: 'TRAINER' } }),
      ctx.db.exercise.count(),
    ]);

    return { totalUsers, totalTrainers, totalExercises };
  }),
});

const makeContext = (role: UserRole | null): TestContext => ({
  session: role
    ? { user: { id: 'user-1', role, email: 'admin@test.com' }, expires: '2099' }
    : null,
  db: mockDb,
});

const makeCaller = (role: UserRole | null) =>
  t.createCallerFactory(testRouter)(makeContext(role));

beforeEach(() => {
  vi.clearAllMocks();
});

// ── getAdminStats ─────────────────────────────────────────────────────────────

describe('user.getAdminStats', () => {
  it('returns counts for users, trainers, and exercises', async () => {
    mockDb.user.count
      .mockResolvedValueOnce(42)   // CLIENT count
      .mockResolvedValueOnce(8);   // TRAINER count
    mockDb.exercise.count.mockResolvedValue(120);

    const result = await makeCaller('ADMIN').getAdminStats();

    expect(result.totalUsers).toBe(42);
    expect(result.totalTrainers).toBe(8);
    expect(result.totalExercises).toBe(120);
  });

  it('returns zero counts when no data exists', async () => {
    mockDb.user.count.mockResolvedValue(0);
    mockDb.exercise.count.mockResolvedValue(0);

    const result = await makeCaller('ADMIN').getAdminStats();

    expect(result.totalUsers).toBe(0);
    expect(result.totalTrainers).toBe(0);
    expect(result.totalExercises).toBe(0);
  });

  it('throws FORBIDDEN for TRAINER role', async () => {
    await expect(makeCaller('TRAINER').getAdminStats()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('throws FORBIDDEN for CLIENT role', async () => {
    await expect(makeCaller('CLIENT').getAdminStats()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('throws UNAUTHORIZED when unauthenticated', async () => {
    await expect(makeCaller(null).getAdminStats()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});
