import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { z } from 'zod';
import type { UserRole } from '@/generated/prisma/enums';

// ── Mock Prisma so tests never hit the real database ──────────────────────────

const mockDb = {
  challenge: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  challengeParticipant: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
  workoutLog: {
    findMany: vi.fn(),
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

const hasRole = (allowedRoles: UserRole[]) =>
  t.middleware(({ ctx, next }) => {
    if (!ctx.session?.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
    if (!allowedRoles.includes(ctx.session.user.role)) throw new TRPCError({ code: 'FORBIDDEN' });
    return next({ ctx: { session: ctx.session, db: ctx.db } });
  });

const protectedProcedure = t.procedure.use(isAuthed);
const adminProcedure = t.procedure.use(hasRole(['ADMIN']));

// ── Inline challenge router logic for test isolation ─────────────────────────

const testRouter = t.router({
  // ── activate ──────────────────────────────────────────────────────────────
  activate: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const challenge = await ctx.db.challenge.findUnique({ where: { id: input.id } });
      if (!challenge) throw new TRPCError({ code: 'NOT_FOUND' });
      if (challenge.status !== 'DRAFT')
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only DRAFT challenges can be activated' });
      return ctx.db.challenge.update({ where: { id: input.id }, data: { status: 'ACTIVE' } });
    }),

  // ── cancel ────────────────────────────────────────────────────────────────
  cancel: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const challenge = await ctx.db.challenge.findUnique({ where: { id: input.id } });
      if (!challenge) throw new TRPCError({ code: 'NOT_FOUND' });
      if (!['DRAFT', 'ACTIVE'].includes(challenge.status))
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Challenge cannot be cancelled' });
      return ctx.db.challenge.update({ where: { id: input.id }, data: { status: 'CANCELLED' } });
    }),

  // ── join ──────────────────────────────────────────────────────────────────
  join: protectedProcedure
    .input(z.object({ challengeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const challenge = await ctx.db.challenge.findUnique({
        where: { id: input.challengeId },
        select: { status: true },
      });
      if (!challenge) throw new TRPCError({ code: 'NOT_FOUND' });
      if (challenge.status !== 'ACTIVE')
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'You can only join active challenges' });
      return ctx.db.challengeParticipant.upsert({
        where: { challengeId_userId: { challengeId: input.challengeId, userId: ctx.session.user.id } },
        create: { challengeId: input.challengeId, userId: ctx.session.user.id },
        update: { optedOut: false },
      });
    }),

  // ── leave ─────────────────────────────────────────────────────────────────
  leave: protectedProcedure
    .input(z.object({ challengeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const participant = await ctx.db.challengeParticipant.findUnique({
        where: { challengeId_userId: { challengeId: input.challengeId, userId: ctx.session.user.id } },
      });
      if (!participant || participant.optedOut)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Not participating in this challenge' });
      return ctx.db.challengeParticipant.update({
        where: { challengeId_userId: { challengeId: input.challengeId, userId: ctx.session.user.id } },
        data: { optedOut: true },
      });
    }),

  // ── getLeaderboard ────────────────────────────────────────────────────────
  getLeaderboard: protectedProcedure
    .input(z.object({ challengeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const challenge = await ctx.db.challenge.findUnique({
        where: { id: input.challengeId },
        select: { type: true, startDate: true, endDate: true },
      });
      if (!challenge) throw new TRPCError({ code: 'NOT_FOUND' });

      const participants = await ctx.db.challengeParticipant.findMany({
        where: { challengeId: input.challengeId, optedOut: false },
        include: {
          user: {
            select: {
              id: true, name: true, image: true,
              clientProfile: { select: { id: true } },
            },
          },
        },
      }) as Array<{ user: { id: string; name: string | null; image: string | null; clientProfile: { id: string } | null }; joinedAt: Date }>;

      if (participants.length === 0) return [];

      const scoreByUserId = new Map<string, number>();

      if (challenge.type === 'WORKOUT_COUNT' || challenge.type === 'TOTAL_VOLUME') {
        const clientProfileIds = participants
          .map((p) => p.user.clientProfile?.id)
          .filter(Boolean) as string[];

        if (clientProfileIds.length > 0) {
          const logs = await ctx.db.workoutLog.findMany({
            where: {
              clientId: { in: clientProfileIds },
              status: 'COMPLETED',
              date: { gte: challenge.startDate, lte: challenge.endDate },
            },
            select: {
              clientId: true,
              exercises: { select: { sets: { where: { isWarmup: false }, select: { reps: true, weightKg: true } } } },
            },
          }) as Array<{ clientId: string; exercises: Array<{ sets: Array<{ reps: number | null; weightKg: number | null }> }> }>;

          const clientToUser = new Map<string, string>(
            participants
              .filter((p) => p.user.clientProfile)
              .map((p) => [p.user.clientProfile!.id, p.user.id]),
          );

          for (const log of logs) {
            const uid = clientToUser.get(log.clientId);
            if (!uid) continue;
            if (challenge.type === 'WORKOUT_COUNT') {
              scoreByUserId.set(uid, (scoreByUserId.get(uid) ?? 0) + 1);
            } else {
              const vol = log.exercises
                .flatMap((e) => e.sets)
                .reduce((sum, s) => sum + (s.weightKg ?? 0) * (s.reps ?? 0), 0);
              scoreByUserId.set(uid, (scoreByUserId.get(uid) ?? 0) + vol);
            }
          }
        }
      }

      return participants
        .map((p) => ({
          userId: p.user.id,
          name: p.user.name ?? 'Unknown',
          image: p.user.image,
          score: scoreByUserId.get(p.user.id) ?? 0,
          joinedAt: p.joinedAt,
          isMe: p.user.id === ctx.session.user.id,
        }))
        .sort((a, b) => b.score - a.score)
        .map((entry, i) => ({ ...entry, rank: i + 1 }));
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

// ── activate ──────────────────────────────────────────────────────────────────

describe('challenge.activate', () => {
  it('transitions a DRAFT challenge to ACTIVE', async () => {
    mockDb.challenge.findUnique.mockResolvedValue({ id: 'ch-1', status: 'DRAFT' });
    mockDb.challenge.update.mockResolvedValue({ id: 'ch-1', status: 'ACTIVE' });

    const result = await makeCaller('ADMIN').activate({ id: 'ch-1' });
    expect(result.status).toBe('ACTIVE');
  });

  it('throws BAD_REQUEST if challenge is already ACTIVE', async () => {
    mockDb.challenge.findUnique.mockResolvedValue({ id: 'ch-1', status: 'ACTIVE' });
    await expect(makeCaller('ADMIN').activate({ id: 'ch-1' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('throws NOT_FOUND for unknown challenge', async () => {
    mockDb.challenge.findUnique.mockResolvedValue(null);
    await expect(makeCaller('ADMIN').activate({ id: 'ch-x' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws FORBIDDEN for CLIENT role', async () => {
    await expect(makeCaller('CLIENT').activate({ id: 'ch-1' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

// ── cancel ────────────────────────────────────────────────────────────────────

describe('challenge.cancel', () => {
  it('cancels a DRAFT challenge', async () => {
    mockDb.challenge.findUnique.mockResolvedValue({ id: 'ch-1', status: 'DRAFT' });
    mockDb.challenge.update.mockResolvedValue({ id: 'ch-1', status: 'CANCELLED' });
    const result = await makeCaller('ADMIN').cancel({ id: 'ch-1' });
    expect(result.status).toBe('CANCELLED');
  });

  it('cancels an ACTIVE challenge', async () => {
    mockDb.challenge.findUnique.mockResolvedValue({ id: 'ch-1', status: 'ACTIVE' });
    mockDb.challenge.update.mockResolvedValue({ id: 'ch-1', status: 'CANCELLED' });
    await makeCaller('ADMIN').cancel({ id: 'ch-1' });
    expect(mockDb.challenge.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'CANCELLED' } }),
    );
  });

  it('throws BAD_REQUEST if challenge is already COMPLETED', async () => {
    mockDb.challenge.findUnique.mockResolvedValue({ id: 'ch-1', status: 'COMPLETED' });
    await expect(makeCaller('ADMIN').cancel({ id: 'ch-1' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});

// ── join ──────────────────────────────────────────────────────────────────────

describe('challenge.join', () => {
  it('allows a user to join an ACTIVE challenge', async () => {
    mockDb.challenge.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    mockDb.challengeParticipant.upsert.mockResolvedValue({ challengeId: 'ch-1', userId: 'user-1' });

    await makeCaller('CLIENT').join({ challengeId: 'ch-1' });
    expect(mockDb.challengeParticipant.upsert).toHaveBeenCalled();
  });

  it('throws BAD_REQUEST when joining a DRAFT challenge', async () => {
    mockDb.challenge.findUnique.mockResolvedValue({ status: 'DRAFT' });
    await expect(makeCaller('CLIENT').join({ challengeId: 'ch-1' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('throws UNAUTHORIZED when unauthenticated', async () => {
    await expect(makeCaller(null).join({ challengeId: 'ch-1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

// ── leave ─────────────────────────────────────────────────────────────────────

describe('challenge.leave', () => {
  it('sets optedOut=true for an active participant', async () => {
    mockDb.challengeParticipant.findUnique.mockResolvedValue({ optedOut: false });
    mockDb.challengeParticipant.update.mockResolvedValue({ optedOut: true });

    await makeCaller('CLIENT').leave({ challengeId: 'ch-1' });
    expect(mockDb.challengeParticipant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { optedOut: true } }),
    );
  });

  it('throws BAD_REQUEST if user has already opted out', async () => {
    mockDb.challengeParticipant.findUnique.mockResolvedValue({ optedOut: true });
    await expect(makeCaller('CLIENT').leave({ challengeId: 'ch-1' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('throws BAD_REQUEST if user never joined', async () => {
    mockDb.challengeParticipant.findUnique.mockResolvedValue(null);
    await expect(makeCaller('CLIENT').leave({ challengeId: 'ch-1' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});

// ── getLeaderboard ────────────────────────────────────────────────────────────

describe('challenge.getLeaderboard', () => {
  const baseChallenge = {
    type: 'WORKOUT_COUNT',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-01-31'),
  };

  it('returns empty array when no participants', async () => {
    mockDb.challenge.findUnique.mockResolvedValue(baseChallenge);
    mockDb.challengeParticipant.findMany.mockResolvedValue([]);

    const result = await makeCaller('CLIENT').getLeaderboard({ challengeId: 'ch-1' });
    expect(result).toHaveLength(0);
  });

  it('counts workouts per user for WORKOUT_COUNT type', async () => {
    mockDb.challenge.findUnique.mockResolvedValue(baseChallenge);
    mockDb.challengeParticipant.findMany.mockResolvedValue([
      { user: { id: 'u1', name: 'Alice', image: null, clientProfile: { id: 'cp1' } }, joinedAt: new Date() },
      { user: { id: 'u2', name: 'Bob', image: null, clientProfile: { id: 'cp2' } }, joinedAt: new Date() },
    ]);
    // Alice has 3 workouts, Bob has 1
    mockDb.workoutLog.findMany.mockResolvedValue([
      { clientId: 'cp1', exercises: [] },
      { clientId: 'cp1', exercises: [] },
      { clientId: 'cp1', exercises: [] },
      { clientId: 'cp2', exercises: [] },
    ]);

    const result = await makeCaller('CLIENT', 'u1').getLeaderboard({ challengeId: 'ch-1' });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ userId: 'u1', score: 3, rank: 1, isMe: true });
    expect(result[1]).toMatchObject({ userId: 'u2', score: 1, rank: 2, isMe: false });
  });

  it('sums volume (weightKg × reps) for TOTAL_VOLUME type', async () => {
    mockDb.challenge.findUnique.mockResolvedValue({ ...baseChallenge, type: 'TOTAL_VOLUME' });
    mockDb.challengeParticipant.findMany.mockResolvedValue([
      { user: { id: 'u1', name: 'Alice', image: null, clientProfile: { id: 'cp1' } }, joinedAt: new Date() },
    ]);
    mockDb.workoutLog.findMany.mockResolvedValue([
      {
        clientId: 'cp1',
        exercises: [
          { sets: [{ reps: 10, weightKg: 100 }, { reps: 8, weightKg: 110 }] }, // 1000 + 880 = 1880
        ],
      },
    ]);

    const result = await makeCaller('CLIENT', 'u1').getLeaderboard({ challengeId: 'ch-1' });
    expect(result[0].score).toBe(1880);
  });

  it('throws NOT_FOUND for unknown challenge', async () => {
    mockDb.challenge.findUnique.mockResolvedValue(null);
    await expect(makeCaller('CLIENT').getLeaderboard({ challengeId: 'ch-x' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws UNAUTHORIZED when unauthenticated', async () => {
    await expect(makeCaller(null).getLeaderboard({ challengeId: 'ch-1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});
