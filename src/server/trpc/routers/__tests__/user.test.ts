import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import type { UserRole } from '@/generated/prisma/enums';

// ── Mock Prisma so tests never touch the real database ────────────────────────

const mockDb = {
  user: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
  exercise: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
  workoutLog: {
    findMany: vi.fn(),
  },
  workoutExercise: {
    groupBy: vi.fn(),
  },
  trainerProfile: {
    findMany: vi.fn(),
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

// ── Inline helper functions (mirrors user.ts module-level functions) ──────────

function analyticsIsoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function analyticsWeekLabel(isoWeekStr: string): string {
  const [year, week] = isoWeekStr.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const weekStart = new Date(jan4.getTime() + (week - 1) * 7 * 86400000);
  weekStart.setUTCDate(weekStart.getUTCDate() - (weekStart.getUTCDay() || 7) + 1);
  return weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

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

  // Admin analytics — mirrors logic from user.ts
  getAdminAnalytics: adminProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const twelveWeeksAgo = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const weekKeys: string[] = [];
    for (let w = 11; w >= 0; w--) {
      const d = new Date(now.getTime() - w * 7 * 24 * 60 * 60 * 1000);
      weekKeys.push(analyticsIsoWeek(d));
    }

    const [newClients, completedLogs, topExerciseGroups, trainerProfiles] = await Promise.all([
      ctx.db.user.findMany({
        where: { role: 'CLIENT', createdAt: { gte: twelveWeeksAgo } },
        select: { createdAt: true },
      }),
      ctx.db.workoutLog.findMany({
        where: { status: 'COMPLETED', date: { gte: twelveWeeksAgo } },
        select: { date: true, clientId: true },
      }),
      ctx.db.workoutExercise.groupBy({
        by: ['exerciseId'],
        _count: { exerciseId: true },
        orderBy: { _count: { exerciseId: 'desc' } },
        take: 10,
      }),
      ctx.db.trainerProfile.findMany({
        select: {
          id: true,
          user: { select: { name: true } },
          clientMappings: { where: { isActive: true }, select: { clientId: true } },
        },
      }),
    ]);

    const growthMap = new Map<string, number>(weekKeys.map((k) => [k, 0]));
    for (const u of newClients as Array<{ createdAt: Date }>) {
      const key = analyticsIsoWeek(new Date(u.createdAt));
      if (growthMap.has(key)) growthMap.set(key, (growthMap.get(key) ?? 0) + 1);
    }
    const userGrowth = weekKeys.map((k) => ({
      weekLabel: analyticsWeekLabel(k),
      newUsers: growthMap.get(k) ?? 0,
    }));

    const activityMap = new Map<string, number>(weekKeys.map((k) => [k, 0]));
    for (const log of completedLogs as Array<{ date: Date; clientId: string }>) {
      const key = analyticsIsoWeek(new Date(log.date));
      if (activityMap.has(key)) activityMap.set(key, (activityMap.get(key) ?? 0) + 1);
    }
    const platformActivity = weekKeys.map((k) => ({
      weekLabel: analyticsWeekLabel(k),
      workouts: activityMap.get(k) ?? 0,
    }));

    const exerciseIds = (topExerciseGroups as Array<{ exerciseId: string; _count: { exerciseId: number } }>).map((g) => g.exerciseId);
    const exercises = exerciseIds.length > 0
      ? await ctx.db.exercise.findMany({
          where: { id: { in: exerciseIds } },
          select: { id: true, name: true },
        })
      : [];
    const exerciseNameMap = new Map((exercises as Array<{ id: string; name: string }>).map((e) => [e.id, e.name]));
    const topExercises = (topExerciseGroups as Array<{ exerciseId: string; _count: { exerciseId: number } }>).map((g) => ({
      name: exerciseNameMap.get(g.exerciseId) ?? 'Unknown',
      count: g._count.exerciseId,
    }));

    const allClientIds = (trainerProfiles as Array<{ id: string; user: { name: string | null }; clientMappings: Array<{ clientId: string }> }>).flatMap((t) => t.clientMappings.map((m) => m.clientId));
    const recentLogs = allClientIds.length > 0
      ? await ctx.db.workoutLog.findMany({
          where: { clientId: { in: allClientIds }, status: 'COMPLETED', date: { gte: thirtyDaysAgo } },
          select: { clientId: true },
        })
      : [];

    const completedByClient = new Map<string, number>();
    for (const log of recentLogs as Array<{ clientId: string }>) {
      completedByClient.set(log.clientId, (completedByClient.get(log.clientId) ?? 0) + 1);
    }

    const trainerComparison = (trainerProfiles as Array<{ id: string; user: { name: string | null }; clientMappings: Array<{ clientId: string }> }>)
      .map((tr) => {
        const clientIds = tr.clientMappings.map((m) => m.clientId);
        const completedLast30 = clientIds.reduce(
          (sum, cid) => sum + (completedByClient.get(cid) ?? 0), 0,
        );
        return { name: tr.user.name ?? 'Unknown', clientCount: clientIds.length, completedLast30 };
      })
      .sort((a, b) => b.completedLast30 - a.completedLast30);

    return { userGrowth, platformActivity, topExercises, trainerComparison };
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

// ── getAdminAnalytics ─────────────────────────────────────────────────────────

describe('user.getAdminAnalytics', () => {
  beforeEach(() => {
    // Default empty responses for all sub-queries
    mockDb.user.findMany.mockResolvedValue([]);
    mockDb.workoutLog.findMany.mockResolvedValue([]);
    mockDb.workoutExercise.groupBy.mockResolvedValue([]);
    mockDb.trainerProfile.findMany.mockResolvedValue([]);
    mockDb.exercise.findMany.mockResolvedValue([]);
  });

  it('returns 12 weeks of zero-filled data when there is no activity', async () => {
    const result = await makeCaller('ADMIN').getAdminAnalytics();

    expect(result.userGrowth).toHaveLength(12);
    expect(result.platformActivity).toHaveLength(12);
    expect(result.userGrowth.every((w) => w.newUsers === 0)).toBe(true);
    expect(result.platformActivity.every((w) => w.workouts === 0)).toBe(true);
    expect(result.topExercises).toHaveLength(0);
    expect(result.trainerComparison).toHaveLength(0);
  });

  it('counts new clients in the correct week bucket', async () => {
    // Simulate 2 clients registered this week (within last 7 days)
    const recent = new Date();
    mockDb.user.findMany.mockResolvedValue([
      { createdAt: recent },
      { createdAt: recent },
    ]);

    const result = await makeCaller('ADMIN').getAdminAnalytics();

    // The last week in the array should have 2 new users
    const lastWeek = result.userGrowth[result.userGrowth.length - 1];
    expect(lastWeek.newUsers).toBe(2);
    // Total across all 12 weeks should equal 2
    const total = result.userGrowth.reduce((s, w) => s + w.newUsers, 0);
    expect(total).toBe(2);
  });

  it('counts completed workout logs per week in platformActivity', async () => {
    const recent = new Date();
    mockDb.workoutLog.findMany.mockResolvedValue([
      { date: recent, clientId: 'c1' },
      { date: recent, clientId: 'c2' },
      { date: recent, clientId: 'c3' },
    ]);

    const result = await makeCaller('ADMIN').getAdminAnalytics();

    const lastWeek = result.platformActivity[result.platformActivity.length - 1];
    expect(lastWeek.workouts).toBe(3);
  });

  it('resolves exercise names for topExercises', async () => {
    mockDb.workoutExercise.groupBy.mockResolvedValue([
      { exerciseId: 'ex-1', _count: { exerciseId: 15 } },
      { exerciseId: 'ex-2', _count: { exerciseId: 8 } },
    ]);
    mockDb.exercise.findMany.mockResolvedValue([
      { id: 'ex-1', name: 'Squat' },
      { id: 'ex-2', name: 'Bench Press' },
    ]);

    const result = await makeCaller('ADMIN').getAdminAnalytics();

    expect(result.topExercises).toHaveLength(2);
    expect(result.topExercises[0]).toEqual({ name: 'Squat', count: 15 });
    expect(result.topExercises[1]).toEqual({ name: 'Bench Press', count: 8 });
  });

  it('computes per-trainer completedLast30 from batched log query', async () => {
    mockDb.trainerProfile.findMany.mockResolvedValue([
      {
        id: 'tp-1',
        user: { name: 'Alice Trainer' },
        clientMappings: [{ clientId: 'c1' }, { clientId: 'c2' }],
      },
      {
        id: 'tp-2',
        user: { name: 'Bob Trainer' },
        clientMappings: [{ clientId: 'c3' }],
      },
    ]);
    // Batch log query returns 3 logs for Alice's clients, 1 for Bob's
    mockDb.workoutLog.findMany
      .mockResolvedValueOnce([])   // platform activity query (twelveWeeksAgo)
      .mockResolvedValueOnce([     // trainer comparison query (thirtyDaysAgo)
        { clientId: 'c1' },
        { clientId: 'c1' },
        { clientId: 'c2' },
        { clientId: 'c3' },
      ]);

    const result = await makeCaller('ADMIN').getAdminAnalytics();

    // Sorted by completedLast30 desc: Alice(3) > Bob(1)
    expect(result.trainerComparison[0].name).toBe('Alice Trainer');
    expect(result.trainerComparison[0].completedLast30).toBe(3);
    expect(result.trainerComparison[0].clientCount).toBe(2);
    expect(result.trainerComparison[1].name).toBe('Bob Trainer');
    expect(result.trainerComparison[1].completedLast30).toBe(1);
  });

  it('throws FORBIDDEN for TRAINER role', async () => {
    await expect(makeCaller('TRAINER').getAdminAnalytics()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('throws FORBIDDEN for CLIENT role', async () => {
    await expect(makeCaller('CLIENT').getAdminAnalytics()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('throws UNAUTHORIZED when unauthenticated', async () => {
    await expect(makeCaller(null).getAdminAnalytics()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});
