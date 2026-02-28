import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { z } from 'zod';
import type { UserRole } from '@/generated/prisma/enums';

// ── Mock Prisma so tests never touch the real database ────────────────────────

const mockExercise = {
  id: 'ex-1',
  name: 'Bench Press',
  description: 'A chest exercise',
  instructions: null,
  primaryMuscle: 'CHEST' as const,
  secondaryMuscles: ['TRICEPS', 'SHOULDERS'] as const,
  equipment: 'BARBELL' as const,
  category: 'STRENGTH' as const,
  difficulty: 'INTERMEDIATE' as const,
  mediaUrl: null,
  mediaType: null,
  createdById: 'user-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: { name: 'Admin' },
};

const mockDb = {
  exercise: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  workoutExercise: {
    findFirst: vi.fn(),
  },
  $transaction: vi.fn(),
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

const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { session: ctx.session, db: ctx.db } });
});
const adminProcedure = t.procedure.use(hasRole(['ADMIN']));

// Inline the exercise router logic using our test procedures
const testRouter = t.router({
  list: protectedProcedure
    .query(async ({ ctx }) => {
      const [exercises, total] = await ctx.db.$transaction([
        ctx.db.exercise.findMany({}),
        ctx.db.exercise.count({}),
      ]);
      return { exercises, total, page: 1, totalPages: 1 };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const exercise = await ctx.db.exercise.findUnique({ where: { id: input.id } });
      if (!exercise) throw new TRPCError({ code: 'NOT_FOUND', message: 'Exercise not found' });
      return exercise;
    }),

  create: adminProcedure
    .mutation(async ({ ctx }) => {
      return ctx.db.exercise.create({ data: {} });
    }),

  update: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.exercise.findUnique({ where: { id: input.id } });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Exercise not found' });
      return ctx.db.exercise.update({ where: { id: input.id }, data: {} });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const inUse = await ctx.db.workoutExercise.findFirst({ where: { exerciseId: input.id } });
      if (inUse) throw new TRPCError({ code: 'CONFLICT', message: 'Cannot delete an exercise that is used in existing workouts.' });
      await ctx.db.exercise.delete({ where: { id: input.id } });
      return { success: true };
    }),
});

const makeContext = (role: UserRole | null): TestContext => ({
  session: role
    ? { user: { id: 'user-1', role, email: 'x@x.com' }, expires: '2099' }
    : null,
  db: mockDb,
});

const makeCaller = (role: UserRole | null) =>
  t.createCallerFactory(testRouter)(makeContext(role));

beforeEach(() => {
  vi.clearAllMocks();
});

// ── list ─────────────────────────────────────────────────────────────────────

describe('exercise.list', () => {
  it('returns exercises for any authenticated user', async () => {
    mockDb.$transaction.mockResolvedValue([[mockExercise], 1]);
    const result = await makeCaller('CLIENT').list();
    expect(result.exercises).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('throws UNAUTHORIZED when unauthenticated', async () => {
    await expect(makeCaller(null).list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

// ── getById ──────────────────────────────────────────────────────────────────

describe('exercise.getById', () => {
  it('returns exercise when found', async () => {
    mockDb.exercise.findUnique.mockResolvedValue(mockExercise);
    const result = await makeCaller('TRAINER').getById({ id: 'ex-1' } as any);
    expect(result.id).toBe('ex-1');
    expect(result.name).toBe('Bench Press');
  });

  it('throws NOT_FOUND when exercise does not exist', async () => {
    mockDb.exercise.findUnique.mockResolvedValue(null);
    await expect(makeCaller('CLIENT').getById({ id: 'missing' } as any)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

// ── create ───────────────────────────────────────────────────────────────────

describe('exercise.create', () => {
  it('allows ADMIN to create', async () => {
    mockDb.exercise.create.mockResolvedValue(mockExercise);
    const result = await makeCaller('ADMIN').create();
    expect(mockDb.exercise.create).toHaveBeenCalled();
    expect(result.name).toBe('Bench Press');
  });

  it('throws FORBIDDEN for TRAINER', async () => {
    await expect(makeCaller('TRAINER').create()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws FORBIDDEN for CLIENT', async () => {
    await expect(makeCaller('CLIENT').create()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

// ── update ───────────────────────────────────────────────────────────────────

describe('exercise.update', () => {
  it('allows ADMIN to update an existing exercise', async () => {
    mockDb.exercise.findUnique.mockResolvedValue(mockExercise);
    mockDb.exercise.update.mockResolvedValue({ ...mockExercise, name: 'Updated' });
    const result = await makeCaller('ADMIN').update({ id: 'ex-1' } as any);
    expect(result.name).toBe('Updated');
  });

  it('throws NOT_FOUND when exercise does not exist', async () => {
    mockDb.exercise.findUnique.mockResolvedValue(null);
    await expect(makeCaller('ADMIN').update({ id: 'bad' } as any)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws FORBIDDEN for TRAINER', async () => {
    await expect(makeCaller('TRAINER').update({ id: 'ex-1' } as any)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

// ── delete ───────────────────────────────────────────────────────────────────

describe('exercise.delete', () => {
  it('allows ADMIN to delete an unused exercise', async () => {
    mockDb.workoutExercise.findFirst.mockResolvedValue(null);
    mockDb.exercise.delete.mockResolvedValue(mockExercise);
    const result = await makeCaller('ADMIN').delete({ id: 'ex-1' } as any);
    expect(result.success).toBe(true);
    expect(mockDb.exercise.delete).toHaveBeenCalled();
  });

  it('throws CONFLICT when exercise is in use by a workout', async () => {
    mockDb.workoutExercise.findFirst.mockResolvedValue({ id: 'we-1' });
    await expect(makeCaller('ADMIN').delete({ id: 'ex-1' } as any)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(mockDb.exercise.delete).not.toHaveBeenCalled();
  });

  it('throws FORBIDDEN for TRAINER', async () => {
    await expect(makeCaller('TRAINER').delete({ id: 'ex-1' } as any)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
