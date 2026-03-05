import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { z } from 'zod';
import type { UserRole } from '@/generated/prisma/enums';

// ── Mock Prisma ───────────────────────────────────────────────────────────────

const mockDb = {
  clientProfile: { findUnique: vi.fn() },
  trainerProfile: { findUnique: vi.fn() },
  trainerClientMapping: { findMany: vi.fn() },
  workoutLog: { findMany: vi.fn() },
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

const clientProcedure = t.procedure.use(hasRole(['ADMIN', 'TRAINER', 'CLIENT']));

// ── Inline getScheduled (mirrors workout.ts logic) ────────────────────────────

const testRouter = t.router({
  getScheduled: clientProcedure
    .input(
      z.object({
        startDate: z.string(),
        endDate: z.string(),
        clientId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { startDate, endDate } = input;
      const role = ctx.session.user.role;
      const start = new Date(startDate);
      const end = new Date(endDate + 'T23:59:59.999Z');

      if (role === 'CLIENT') {
        const profile = await ctx.db.clientProfile.findUnique({
          where: { userId: ctx.session.user.id },
          select: { id: true },
        });
        if (!profile) return [];

        const logs = await ctx.db.workoutLog.findMany({
          where: { clientId: profile.id, date: { gte: start, lte: end } },
          select: { id: true, title: true, date: true, scheduledAt: true, status: true },
          orderBy: { date: 'asc' },
        });
        return logs.map((l: any) => ({ ...l, clientName: null, clientImage: null, clientProfileId: profile.id }));
      }

      // Trainer path
      const trainerProfile = await ctx.db.trainerProfile.findUnique({
        where: { userId: ctx.session.user.id },
        select: { id: true },
      });
      if (!trainerProfile) return [];

      const mappings = await ctx.db.trainerClientMapping.findMany({
        where: {
          trainerId: trainerProfile.id,
          isActive: true,
          ...(input.clientId ? { clientId: input.clientId } : {}),
        },
        select: {
          clientId: true,
          client: { select: { user: { select: { name: true, image: true } } } },
        },
      });

      if (mappings.length === 0) return [];

      const clientIds = mappings.map((m: any) => m.clientId);
      const clientMeta = new Map(
        mappings.map((m: any) => [m.clientId, { name: m.client.user.name, image: m.client.user.image }]),
      );

      const logs = await ctx.db.workoutLog.findMany({
        where: { clientId: { in: clientIds }, date: { gte: start, lte: end } },
        select: { id: true, title: true, date: true, scheduledAt: true, status: true, clientId: true },
        orderBy: { date: 'asc' },
      });

      return logs.map((l: any) => ({
        id: l.id,
        title: l.title,
        date: l.date,
        scheduledAt: l.scheduledAt,
        status: l.status,
        clientProfileId: l.clientId,
        clientName: clientMeta.get(l.clientId)?.name ?? null,
        clientImage: clientMeta.get(l.clientId)?.image ?? null,
      }));
    }),
});

const makeContext = (role: UserRole | null, userId = 'user-1'): TestContext => ({
  session: role ? { user: { id: userId, role, email: 'u@test.com' }, expires: '2099' } : null,
  db: mockDb,
});

const makeCaller = (role: UserRole | null, userId = 'user-1') =>
  t.createCallerFactory(testRouter)(makeContext(role, userId));

const INPUT = { startDate: '2026-03-01', endDate: '2026-03-31' };

beforeEach(() => vi.clearAllMocks());

// ── CLIENT role ───────────────────────────────────────────────────────────────

describe('workout.getScheduled — CLIENT role', () => {
  it('returns workouts for the current month with clientName null', async () => {
    mockDb.clientProfile.findUnique.mockResolvedValue({ id: 'cp-1' });
    mockDb.workoutLog.findMany.mockResolvedValue([
      { id: 'w1', title: 'Leg Day', date: new Date('2026-03-10'), scheduledAt: null, status: 'ASSIGNED' },
      { id: 'w2', title: 'Push', date: new Date('2026-03-15'), scheduledAt: null, status: 'COMPLETED' },
    ]);

    const result = await makeCaller('CLIENT').getScheduled(INPUT);

    expect(result).toHaveLength(2);
    expect(result[0].clientName).toBeNull();
    expect(result[0].clientProfileId).toBe('cp-1');
    expect(result[1].status).toBe('COMPLETED');
  });

  it('returns empty array when client has no profile', async () => {
    mockDb.clientProfile.findUnique.mockResolvedValue(null);

    const result = await makeCaller('CLIENT').getScheduled(INPUT);

    expect(result).toHaveLength(0);
    expect(mockDb.workoutLog.findMany).not.toHaveBeenCalled();
  });

  it('returns empty array when no workouts in range', async () => {
    mockDb.clientProfile.findUnique.mockResolvedValue({ id: 'cp-1' });
    mockDb.workoutLog.findMany.mockResolvedValue([]);

    const result = await makeCaller('CLIENT').getScheduled(INPUT);

    expect(result).toHaveLength(0);
  });

  it('passes correct date range to db query', async () => {
    mockDb.clientProfile.findUnique.mockResolvedValue({ id: 'cp-1' });
    mockDb.workoutLog.findMany.mockResolvedValue([]);

    await makeCaller('CLIENT').getScheduled(INPUT);

    expect(mockDb.workoutLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: 'cp-1',
          date: expect.objectContaining({ gte: new Date('2026-03-01') }),
        }),
      }),
    );
  });
});

// ── TRAINER role ──────────────────────────────────────────────────────────────

describe('workout.getScheduled — TRAINER role', () => {
  it('returns all clients\' workouts with clientName populated', async () => {
    mockDb.trainerProfile.findUnique.mockResolvedValue({ id: 'tp-1' });
    mockDb.trainerClientMapping.findMany.mockResolvedValue([
      { clientId: 'cp-1', client: { user: { name: 'Alice', image: null } } },
      { clientId: 'cp-2', client: { user: { name: 'Bob', image: null } } },
    ]);
    mockDb.workoutLog.findMany.mockResolvedValue([
      { id: 'w1', title: 'Squat', date: new Date('2026-03-05'), scheduledAt: null, status: 'ASSIGNED', clientId: 'cp-1' },
      { id: 'w2', title: 'Bench', date: new Date('2026-03-07'), scheduledAt: null, status: 'COMPLETED', clientId: 'cp-2' },
    ]);

    const result = await makeCaller('TRAINER').getScheduled(INPUT);

    expect(result).toHaveLength(2);
    expect(result[0].clientName).toBe('Alice');
    expect(result[1].clientName).toBe('Bob');
  });

  it('returns empty array when trainer has no profile', async () => {
    mockDb.trainerProfile.findUnique.mockResolvedValue(null);

    const result = await makeCaller('TRAINER').getScheduled(INPUT);

    expect(result).toHaveLength(0);
    expect(mockDb.trainerClientMapping.findMany).not.toHaveBeenCalled();
  });

  it('returns empty array when trainer has no active mappings', async () => {
    mockDb.trainerProfile.findUnique.mockResolvedValue({ id: 'tp-1' });
    mockDb.trainerClientMapping.findMany.mockResolvedValue([]);

    const result = await makeCaller('TRAINER').getScheduled(INPUT);

    expect(result).toHaveLength(0);
    expect(mockDb.workoutLog.findMany).not.toHaveBeenCalled();
  });

  it('passes clientId filter through to mapping query when provided', async () => {
    mockDb.trainerProfile.findUnique.mockResolvedValue({ id: 'tp-1' });
    mockDb.trainerClientMapping.findMany.mockResolvedValue([
      { clientId: 'cp-1', client: { user: { name: 'Alice', image: null } } },
    ]);
    mockDb.workoutLog.findMany.mockResolvedValue([]);

    await makeCaller('TRAINER').getScheduled({ ...INPUT, clientId: 'cp-1' });

    expect(mockDb.trainerClientMapping.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ clientId: 'cp-1' }),
      }),
    );
  });
});

// ── Auth guards ───────────────────────────────────────────────────────────────

describe('workout.getScheduled — auth guards', () => {
  it('throws UNAUTHORIZED when unauthenticated', async () => {
    await expect(makeCaller(null).getScheduled(INPUT)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
