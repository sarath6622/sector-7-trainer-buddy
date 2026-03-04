import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { z } from 'zod';
import type { UserRole } from '@/generated/prisma/enums';

// ── Mock Prisma so tests never touch the real database ────────────────────────

const mockHabit = {
  id: 'habit-1',
  clientId: 'profile-1',
  type: 'WATER' as const,
  label: null,
  date: new Date('2026-03-05'),
  value: 6,
  unit: 'glasses',
  notes: null,
  createdAt: new Date(),
};

const mockDb = {
  clientProfile: {
    findUnique: vi.fn(),
  },
  habit: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
};

// Rebuild an isolated tRPC instance to test the router logic in isolation
type TestContext = {
  session: { user: { id: string; role: UserRole; email: string }; expires: string } | null;
  db: typeof mockDb;
};

const t = initTRPC.context<TestContext>().create({ transformer: superjson });

const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { session: ctx.session, db: ctx.db } });
});

// Inline the habit router logic using our test procedures
const testRouter = t.router({
  list: protectedProcedure
    .input(z.object({ startDate: z.string(), endDate: z.string() }))
    .query(async ({ ctx, input }) => {
      const profile = await ctx.db.clientProfile.findUnique({
        where: { userId: ctx.session.user.id },
        select: { id: true },
      });
      if (!profile) return [];
      return ctx.db.habit.findMany({
        where: {
          clientId: profile.id,
          date: { gte: new Date(input.startDate), lte: new Date(input.endDate) },
        },
        orderBy: { date: 'desc' },
      });
    }),

  log: protectedProcedure
    .input(
      z.object({
        type: z.enum(['WATER', 'SLEEP', 'STEPS', 'PROTEIN', 'CALORIES', 'CUSTOM']),
        label: z.string().optional(),
        date: z.string(),
        value: z.number(),
        unit: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.db.clientProfile.findUnique({
        where: { userId: ctx.session.user.id },
        select: { id: true },
      });
      if (!profile) throw new TRPCError({ code: 'NOT_FOUND', message: 'Client profile not found' });
      return ctx.db.habit.upsert({
        where: { clientId_type_date: { clientId: profile.id, type: input.type, date: new Date(input.date) } },
        update: { value: input.value, unit: input.unit, notes: input.notes },
        create: { clientId: profile.id, type: input.type, label: input.label, date: new Date(input.date), value: input.value, unit: input.unit, notes: input.notes },
      });
    }),
});

const makeContext = (role: UserRole | null): TestContext => ({
  session: role
    ? { user: { id: 'user-1', role, email: 'client@test.com' }, expires: '2099' }
    : null,
  db: mockDb,
});

const makeCaller = (role: UserRole | null) =>
  t.createCallerFactory(testRouter)(makeContext(role));

beforeEach(() => {
  vi.clearAllMocks();
});

// ── habit.list ────────────────────────────────────────────────────────────────

describe('habit.list', () => {
  it('returns habits for a client with a profile', async () => {
    mockDb.clientProfile.findUnique.mockResolvedValue({ id: 'profile-1' });
    mockDb.habit.findMany.mockResolvedValue([mockHabit]);

    const result = await makeCaller('CLIENT').list({ startDate: '2026-03-01', endDate: '2026-03-05' });

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('WATER');
    expect(result[0].value).toBe(6);
  });

  it('returns empty array when client has no profile', async () => {
    mockDb.clientProfile.findUnique.mockResolvedValue(null);

    const result = await makeCaller('CLIENT').list({ startDate: '2026-03-01', endDate: '2026-03-05' });

    expect(result).toEqual([]);
    expect(mockDb.habit.findMany).not.toHaveBeenCalled();
  });

  it('throws UNAUTHORIZED when unauthenticated', async () => {
    await expect(
      makeCaller(null).list({ startDate: '2026-03-01', endDate: '2026-03-05' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

// ── habit.log ─────────────────────────────────────────────────────────────────

describe('habit.log', () => {
  it('upserts a habit entry for an existing profile', async () => {
    mockDb.clientProfile.findUnique.mockResolvedValue({ id: 'profile-1' });
    mockDb.habit.upsert.mockResolvedValue(mockHabit);

    const result = await makeCaller('CLIENT').log({
      type: 'WATER',
      date: '2026-03-05',
      value: 6,
      unit: 'glasses',
    });

    expect(mockDb.habit.upsert).toHaveBeenCalledOnce();
    expect(result.value).toBe(6);
    expect(result.type).toBe('WATER');
  });

  it('throws NOT_FOUND when client has no profile', async () => {
    mockDb.clientProfile.findUnique.mockResolvedValue(null);

    await expect(
      makeCaller('CLIENT').log({ type: 'SLEEP', date: '2026-03-05', value: 7 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(mockDb.habit.upsert).not.toHaveBeenCalled();
  });

  it('accepts all valid habit types', async () => {
    mockDb.clientProfile.findUnique.mockResolvedValue({ id: 'profile-1' });
    mockDb.habit.upsert.mockResolvedValue({ ...mockHabit, type: 'STEPS', value: 9500 });

    const types = ['WATER', 'SLEEP', 'STEPS', 'PROTEIN', 'CALORIES', 'CUSTOM'] as const;
    for (const type of types) {
      mockDb.habit.upsert.mockResolvedValueOnce({ ...mockHabit, type, value: 1 });
      await expect(
        makeCaller('CLIENT').log({ type, date: '2026-03-05', value: 1 }),
      ).resolves.toBeDefined();
    }
  });

  it('throws UNAUTHORIZED when unauthenticated', async () => {
    await expect(
      makeCaller(null).log({ type: 'WATER', date: '2026-03-05', value: 8 }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
