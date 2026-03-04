import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { z } from 'zod';
import type { UserRole } from '@/generated/prisma/enums';

// ── Mock Prisma so tests never hit the real database ──────────────────────────

const mockDb = {
  trainerProfile: {
    findUnique: vi.fn(),
  },
  trainerAvailability: {
    create: vi.fn(),
    findUnique: vi.fn(),
    delete: vi.fn(),
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

const trainerProcedure = t.procedure.use(hasRole(['ADMIN', 'TRAINER']));

// ── Inline availability mutations (mirrors trainer.ts logic) ──────────────────

const testRouter = t.router({
  addAvailabilityBlock: trainerProcedure
    .input(
      z.object({
        startDate: z.string(),
        endDate: z.string(),
        reason: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.db.trainerProfile.findUnique({
        where: { userId: ctx.session.user.id },
        select: { id: true },
      });
      if (!profile) throw new TRPCError({ code: 'NOT_FOUND', message: 'Trainer profile not found' });

      const start = new Date(input.startDate);
      const end = new Date(input.endDate);
      if (end <= start)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'End date must be after start date' });

      return ctx.db.trainerAvailability.create({
        data: { trainerId: profile.id, startDate: start, endDate: end, reason: input.reason },
        select: { id: true, startDate: true, endDate: true, reason: true, isBlocked: true },
      });
    }),

  removeAvailabilityBlock: trainerProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.db.trainerProfile.findUnique({
        where: { userId: ctx.session.user.id },
        select: { id: true },
      });
      if (!profile) throw new TRPCError({ code: 'NOT_FOUND', message: 'Trainer profile not found' });

      const block = await ctx.db.trainerAvailability.findUnique({
        where: { id: input.id },
        select: { trainerId: true },
      });
      if (!block) throw new TRPCError({ code: 'NOT_FOUND', message: 'Block not found' });
      if (block.trainerId !== profile.id)
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your availability block' });

      await ctx.db.trainerAvailability.delete({ where: { id: input.id } });
      return { success: true as const };
    }),
});

const makeContext = (role: UserRole | null, userId = 'user-1'): TestContext => ({
  session: role
    ? { user: { id: userId, role, email: 'trainer@test.com' }, expires: '2099' }
    : null,
  db: mockDb,
});

const makeCaller = (role: UserRole | null, userId = 'user-1') =>
  t.createCallerFactory(testRouter)(makeContext(role, userId));

beforeEach(() => vi.clearAllMocks());

// ── addAvailabilityBlock ──────────────────────────────────────────────────────

describe('trainer.addAvailabilityBlock', () => {
  it('creates a block for valid date range', async () => {
    mockDb.trainerProfile.findUnique.mockResolvedValue({ id: 'tp-1' });
    mockDb.trainerAvailability.create.mockResolvedValue({
      id: 'av-1',
      startDate: new Date('2026-04-01'),
      endDate: new Date('2026-04-05'),
      reason: 'Holiday',
      isBlocked: true,
    });

    const result = await makeCaller('TRAINER').addAvailabilityBlock({
      startDate: '2026-04-01',
      endDate: '2026-04-05',
      reason: 'Holiday',
    });

    expect(result.id).toBe('av-1');
    expect(result.reason).toBe('Holiday');
    expect(mockDb.trainerAvailability.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ trainerId: 'tp-1', reason: 'Holiday' }),
      }),
    );
  });

  it('creates a block without a reason', async () => {
    mockDb.trainerProfile.findUnique.mockResolvedValue({ id: 'tp-1' });
    mockDb.trainerAvailability.create.mockResolvedValue({
      id: 'av-2',
      startDate: new Date('2026-05-01'),
      endDate: new Date('2026-05-03'),
      reason: null,
      isBlocked: true,
    });

    const result = await makeCaller('TRAINER').addAvailabilityBlock({
      startDate: '2026-05-01',
      endDate: '2026-05-03',
    });

    expect(result.id).toBe('av-2');
    expect(result.reason).toBeNull();
  });

  it('throws BAD_REQUEST when end date is before start date', async () => {
    mockDb.trainerProfile.findUnique.mockResolvedValue({ id: 'tp-1' });

    await expect(
      makeCaller('TRAINER').addAvailabilityBlock({
        startDate: '2026-04-10',
        endDate: '2026-04-05',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('throws BAD_REQUEST when end date equals start date', async () => {
    mockDb.trainerProfile.findUnique.mockResolvedValue({ id: 'tp-1' });

    await expect(
      makeCaller('TRAINER').addAvailabilityBlock({
        startDate: '2026-04-05',
        endDate: '2026-04-05',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('throws NOT_FOUND when trainer has no profile', async () => {
    mockDb.trainerProfile.findUnique.mockResolvedValue(null);

    await expect(
      makeCaller('TRAINER').addAvailabilityBlock({
        startDate: '2026-04-01',
        endDate: '2026-04-05',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws FORBIDDEN for CLIENT role', async () => {
    await expect(
      makeCaller('CLIENT').addAvailabilityBlock({
        startDate: '2026-04-01',
        endDate: '2026-04-05',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws UNAUTHORIZED when unauthenticated', async () => {
    await expect(
      makeCaller(null).addAvailabilityBlock({
        startDate: '2026-04-01',
        endDate: '2026-04-05',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

// ── removeAvailabilityBlock ───────────────────────────────────────────────────

describe('trainer.removeAvailabilityBlock', () => {
  it('deletes an owned block and returns success', async () => {
    mockDb.trainerProfile.findUnique.mockResolvedValue({ id: 'tp-1' });
    mockDb.trainerAvailability.findUnique.mockResolvedValue({ trainerId: 'tp-1' });
    mockDb.trainerAvailability.delete.mockResolvedValue({});

    const result = await makeCaller('TRAINER').removeAvailabilityBlock({ id: 'av-1' });

    expect(result.success).toBe(true);
    expect(mockDb.trainerAvailability.delete).toHaveBeenCalledWith({ where: { id: 'av-1' } });
  });

  it('throws FORBIDDEN when the block belongs to a different trainer', async () => {
    mockDb.trainerProfile.findUnique.mockResolvedValue({ id: 'tp-1' });
    // Block owned by a different trainer
    mockDb.trainerAvailability.findUnique.mockResolvedValue({ trainerId: 'tp-other' });

    await expect(
      makeCaller('TRAINER').removeAvailabilityBlock({ id: 'av-1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws NOT_FOUND when block does not exist', async () => {
    mockDb.trainerProfile.findUnique.mockResolvedValue({ id: 'tp-1' });
    mockDb.trainerAvailability.findUnique.mockResolvedValue(null);

    await expect(
      makeCaller('TRAINER').removeAvailabilityBlock({ id: 'av-x' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws NOT_FOUND when trainer has no profile', async () => {
    mockDb.trainerProfile.findUnique.mockResolvedValue(null);

    await expect(
      makeCaller('TRAINER').removeAvailabilityBlock({ id: 'av-1' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws UNAUTHORIZED when unauthenticated', async () => {
    await expect(
      makeCaller(null).removeAvailabilityBlock({ id: 'av-1' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
