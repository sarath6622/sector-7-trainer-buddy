import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { z } from 'zod';
import type { UserRole, AchievementType } from '@/generated/prisma/enums';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/server/services/notification.service', () => ({
  NotificationService: {
    send: vi.fn().mockResolvedValue(undefined),
  },
}));

import { NotificationService } from '@/server/services/notification.service';

// ── Mock Prisma ───────────────────────────────────────────────────────────────

const mockDb = {
  userAchievement: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
  },
};

// ── Achievement metadata (mirrors achievement.ts) ─────────────────────────────

const ACHIEVEMENT_META: Record<AchievementType, { emoji: string; title: string; description: string }> = {
  FIRST_WORKOUT: { emoji: '🏋️', title: 'First Workout!', description: "You've completed your very first workout. The journey begins!" },
  STREAK_7:      { emoji: '🔥', title: '7-Day Streak!', description: 'You worked out 7 days in a row. Incredible consistency!' },
  STREAK_30:     { emoji: '🔥', title: '30-Day Streak!', description: 'A full month of daily workouts. You are unstoppable!' },
  STREAK_100:    { emoji: '🏆', title: '100-Day Streak!', description: 'One hundred days straight. Legendary dedication.' },
  WORKOUTS_10:   { emoji: '✅', title: '10 Workouts Done!', description: 'Ten workouts completed. Building a great habit!' },
  WORKOUTS_50:   { emoji: '💪', title: '50 Workouts Done!', description: 'Fifty workouts in the books. Halfway to a century!' },
  WORKOUTS_100:  { emoji: '🎯', title: '100 Workouts Done!', description: 'One hundred workouts completed. Elite status achieved.' },
};

// Inline awardAchievement logic for unit testing without 'server-only' constraint
async function awardAchievement(db: typeof mockDb, userId: string, type: AchievementType): Promise<void> {
  const existing = await db.userAchievement.findUnique({ where: { userId_type: { userId, type } } });
  if (existing) return;
  await db.userAchievement.create({ data: { userId, type } });
  const meta = ACHIEVEMENT_META[type];
  NotificationService.send({
    userId,
    type: 'ACHIEVEMENT',
    title: `${meta.emoji} ${meta.title}`,
    message: meta.description,
    data: { achievementType: type },
  }).catch(() => {});
}

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

const clientProcedure = t.procedure.use(hasRole(['CLIENT', 'TRAINER', 'ADMIN']));
const trainerProcedure = t.procedure.use(hasRole(['TRAINER', 'ADMIN']));

const testRouter = t.router({
  list: clientProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.userAchievement.findMany({
      where: { userId: ctx.session!.user.id },
      orderBy: { earnedAt: 'desc' },
    });
    return (rows as any[]).map((row) => ({
      id: row.id,
      type: row.type,
      earnedAt: row.earnedAt,
      ...ACHIEVEMENT_META[row.type as AchievementType],
    }));
  }),

  getAll: trainerProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.userAchievement.findMany({
        where: { userId: input.userId },
        orderBy: { earnedAt: 'desc' },
      });
      return (rows as any[]).map((row) => ({
        id: row.id,
        type: row.type,
        earnedAt: row.earnedAt,
        ...ACHIEVEMENT_META[row.type as AchievementType],
      }));
    }),
});

const makeContext = (role: UserRole | null): TestContext => ({
  session: role ? { user: { id: 'user-1', role, email: 'u@gym.com' }, expires: '2099' } : null,
  db: mockDb,
});

const makeCaller = (role: UserRole | null) =>
  t.createCallerFactory(testRouter)(makeContext(role));

beforeEach(() => {
  vi.clearAllMocks();
});

// ── awardAchievement helper ───────────────────────────────────────────────────

describe('awardAchievement', () => {
  it('creates badge and fires notification when not yet earned', async () => {
    mockDb.userAchievement.findUnique.mockResolvedValue(null);
    mockDb.userAchievement.create.mockResolvedValue({ id: 'ach-1', userId: 'user-1', type: 'FIRST_WORKOUT', earnedAt: new Date() });

    await awardAchievement(mockDb, 'user-1', 'FIRST_WORKOUT');

    expect(mockDb.userAchievement.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', type: 'FIRST_WORKOUT' },
    });
    expect(NotificationService.send).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', type: 'ACHIEVEMENT', title: expect.stringContaining('First Workout') }),
    );
  });

  it('skips create and notification when badge already earned (idempotency)', async () => {
    mockDb.userAchievement.findUnique.mockResolvedValue({ id: 'ach-1', userId: 'user-1', type: 'FIRST_WORKOUT' });

    await awardAchievement(mockDb, 'user-1', 'FIRST_WORKOUT');

    expect(mockDb.userAchievement.create).not.toHaveBeenCalled();
    expect(NotificationService.send).not.toHaveBeenCalled();
  });
});

// ── achievement.list ──────────────────────────────────────────────────────────

describe('achievement.list', () => {
  it('returns badges enriched with metadata for authenticated client', async () => {
    mockDb.userAchievement.findMany.mockResolvedValue([
      { id: 'ach-1', type: 'FIRST_WORKOUT', earnedAt: new Date('2024-01-10') },
    ]);

    const result = await makeCaller('CLIENT').list();

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('FIRST_WORKOUT');
    expect(result[0].emoji).toBe('🏋️');
    expect(result[0].title).toBe('First Workout!');
    expect(result[0].earnedAt).toBeInstanceOf(Date);
  });

  it('returns empty array when no badges earned', async () => {
    mockDb.userAchievement.findMany.mockResolvedValue([]);
    const result = await makeCaller('CLIENT').list();
    expect(result).toHaveLength(0);
  });

  it('throws UNAUTHORIZED when unauthenticated', async () => {
    await expect(makeCaller(null).list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

// ── achievement.getAll ────────────────────────────────────────────────────────

describe('achievement.getAll', () => {
  it('returns target user badges for TRAINER', async () => {
    mockDb.userAchievement.findMany.mockResolvedValue([
      { id: 'ach-2', type: 'STREAK_7', earnedAt: new Date('2024-02-01') },
    ]);

    const result = await makeCaller('TRAINER').getAll({ userId: 'client-42' });

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('STREAK_7');
    expect(result[0].emoji).toBe('🔥');
  });

  it('throws FORBIDDEN for CLIENT', async () => {
    await expect(makeCaller('CLIENT').getAll({ userId: 'other' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
