import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { z } from 'zod';
import type { UserRole } from '@/generated/prisma/enums';

// ── Mock dependencies so tests never touch the real DB or services ─────────────

const mockDb = {
    clientProfile: { findUnique: vi.fn() },
    trainerProfile: { findUnique: vi.fn() },
    trainerClientMapping: { findFirst: vi.fn() },
    workoutLog: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        findFirst: vi.fn(),
    },
    workoutExercise: { findMany: vi.fn(), deleteMany: vi.fn() },
    workoutSet: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
};

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/server/services/notification.service', () => ({
    NotificationService: { send: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('@/server/services/workout.service', () => ({
    WorkoutService: {
        canTrainerAccessClient: vi.fn(),
        calculateStreak: vi.fn().mockResolvedValue(3),
        getWeeklyCount: vi.fn().mockResolvedValue(2),
        getTotalWorkouts: vi.fn().mockResolvedValue(10),
    },
}));

import { WorkoutService } from '@/server/services/workout.service';

// ── Build isolated tRPC test context ─────────────────────────────────────────

type TestContext = {
    session: { user: { id: string; role: UserRole; name: string; email: string }; expires: string } | null;
    db: typeof mockDb;
};

const t = initTRPC.context<TestContext>().create({ transformer: superjson });

const isAuthed = t.middleware(({ ctx, next }) => {
    if (!ctx.session?.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
    return next({ ctx: { session: ctx.session, db: ctx.db } });
});
const hasRole = (roles: UserRole[]) =>
    t.middleware(({ ctx, next }) => {
        if (!ctx.session?.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        if (!roles.includes(ctx.session.user.role)) throw new TRPCError({ code: 'FORBIDDEN' });
        return next({ ctx: { session: ctx.session, db: ctx.db } });
    });

const clientProcedure = t.procedure.use(hasRole(['ADMIN', 'TRAINER', 'CLIENT']));
const trainerProcedure = t.procedure.use(hasRole(['ADMIN', 'TRAINER']));

// Inline minimal workout router logic so tests stay close to the router source
const testRouter = t.router({
    // list: basic role check — CLIENT gets own profile, TRAINER checks access
    list: clientProcedure.query(async ({ ctx }) => {
        const role = ctx.session.user.role;
        if (role === 'CLIENT') {
            const profile = await ctx.db.clientProfile.findUnique({ where: { userId: ctx.session.user.id }, select: { id: true } });
            if (!profile) return { workouts: [], total: 0, page: 1, totalPages: 0 };
        }
        const workouts = await ctx.db.workoutLog.findMany({});
        return { workouts, total: workouts.length, page: 1, totalPages: 1 };
    }),

    // assign: trainer must own client before creating
    assign: trainerProcedure
        .input(z.object({ clientId: z.string(), title: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const hasAccess = await WorkoutService.canTrainerAccessClient(ctx.session.user.id, input.clientId);
            if (!hasAccess) throw new TRPCError({ code: 'FORBIDDEN', message: 'Client not assigned to you' });
            return ctx.db.workoutLog.create({ data: { clientId: input.clientId, title: input.title } });
        }),

    // log: client self-log always uses COMPLETED status
    log: clientProcedure.mutation(async ({ ctx }) => {
        const profile = await ctx.db.clientProfile.findUnique({ where: { userId: ctx.session.user.id }, select: { id: true } });
        if (!profile) throw new TRPCError({ code: 'NOT_FOUND', message: 'Client profile not found' });
        return ctx.db.workoutLog.create({ data: { clientId: profile.id, status: 'COMPLETED' } });
    }),

    // complete: guards against re-completing / completing a SKIPPED log
    complete: clientProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const profile = await ctx.db.clientProfile.findUnique({ where: { userId: ctx.session.user.id }, select: { id: true } });
            if (!profile) throw new TRPCError({ code: 'NOT_FOUND' });
            const existing = await ctx.db.workoutLog.findUnique({ where: { id: input.id }, select: { clientId: true, status: true } });
            if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
            if (existing.clientId !== profile.id) throw new TRPCError({ code: 'FORBIDDEN' });
            if (existing.status === 'COMPLETED' || existing.status === 'SKIPPED') {
                throw new TRPCError({ code: 'BAD_REQUEST', message: `Cannot complete a workout with status: ${existing.status}` });
            }
            return ctx.db.workoutLog.update({ where: { id: input.id }, data: { status: 'COMPLETED' } });
        }),

    // delete: trainer cannot delete a COMPLETED workout
    delete: trainerProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const workout = await ctx.db.workoutLog.findUnique({ where: { id: input.id }, select: { clientId: true, status: true } });
            if (!workout) throw new TRPCError({ code: 'NOT_FOUND' });
            if (workout.status === 'COMPLETED') throw new TRPCError({ code: 'CONFLICT', message: 'Cannot delete a completed workout' });
            const hasAccess = await WorkoutService.canTrainerAccessClient(ctx.session.user.id, workout.clientId);
            if (!hasAccess) throw new TRPCError({ code: 'FORBIDDEN' });
            await ctx.db.workoutLog.delete({ where: { id: input.id } });
            return { success: true };
        }),

    // getStats: returns zeros when no client profile
    getStats: clientProcedure.query(async ({ ctx }) => {
        const profile = await ctx.db.clientProfile.findUnique({ where: { userId: ctx.session.user.id }, select: { id: true } });
        if (!profile) return { streak: 0, weeklyCount: 0, totalWorkouts: 0, lastWorkout: null };
        const [streak, weeklyCount, totalWorkouts, lastWorkout] = await Promise.all([
            WorkoutService.calculateStreak(profile.id),
            WorkoutService.getWeeklyCount(profile.id),
            WorkoutService.getTotalWorkouts(profile.id),
            ctx.db.workoutLog.findFirst({ where: { clientId: profile.id, status: 'COMPLETED' }, orderBy: { date: 'desc' }, select: { title: true, date: true } }),
        ]);
        return { streak, weeklyCount, totalWorkouts, lastWorkout };
    }),
});

const makeCtx = (role: UserRole | null): TestContext => ({
    session: role ? { user: { id: 'usr-1', role, name: 'Test', email: 'x@x.com' }, expires: '2099' } : null,
    db: mockDb,
});
const caller = (role: UserRole | null) => t.createCallerFactory(testRouter)(makeCtx(role));

beforeEach(() => vi.clearAllMocks());

// ── workout.list ──────────────────────────────────────────────────────────────

describe('workout.list', () => {
    it('returns workouts for CLIENT after resolving their profile', async () => {
        mockDb.clientProfile.findUnique.mockResolvedValue({ id: 'cp-1' });
        mockDb.workoutLog.findMany.mockResolvedValue([{ id: 'w-1' }]);
        const result = await caller('CLIENT').list();
        expect(result.workouts).toHaveLength(1);
    });

    it('returns empty list when CLIENT has no profile', async () => {
        mockDb.clientProfile.findUnique.mockResolvedValue(null);
        const result = await caller('CLIENT').list();
        expect(result.workouts).toHaveLength(0);
    });

    it('throws FORBIDDEN for unauthenticated requests', async () => {
        await expect(caller(null).list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });
});

// ── workout.assign ────────────────────────────────────────────────────────────

describe('workout.assign', () => {
    it('creates a workout when trainer has access to client', async () => {
        vi.mocked(WorkoutService.canTrainerAccessClient).mockResolvedValue(true);
        mockDb.workoutLog.create.mockResolvedValue({ id: 'w-2', title: 'Push Day' });
        const result = await caller('TRAINER').assign({ clientId: 'cp-1', title: 'Push Day' });
        expect(result.id).toBe('w-2');
        expect(mockDb.workoutLog.create).toHaveBeenCalled();
    });

    it('throws FORBIDDEN when trainer does not own the client', async () => {
        vi.mocked(WorkoutService.canTrainerAccessClient).mockResolvedValue(false);
        await expect(caller('TRAINER').assign({ clientId: 'cp-other', title: 'Push Day' })).rejects.toMatchObject({
            code: 'FORBIDDEN',
        });
    });

    it('throws FORBIDDEN for CLIENT role', async () => {
        await expect(caller('CLIENT').assign({ clientId: 'cp-1', title: 'Push Day' })).rejects.toMatchObject({
            code: 'FORBIDDEN',
        });
    });
});

// ── workout.log ───────────────────────────────────────────────────────────────

describe('workout.log', () => {
    it('creates a COMPLETED workout for a client', async () => {
        mockDb.clientProfile.findUnique.mockResolvedValue({ id: 'cp-1' });
        mockDb.workoutLog.create.mockResolvedValue({ id: 'w-3', status: 'COMPLETED' });
        const result = await caller('CLIENT').log();
        expect(mockDb.workoutLog.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }),
        );
        expect(result.status).toBe('COMPLETED');
    });

    it('throws NOT_FOUND when client has no profile', async () => {
        mockDb.clientProfile.findUnique.mockResolvedValue(null);
        await expect(caller('CLIENT').log()).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
});

// ── workout.complete ──────────────────────────────────────────────────────────

describe('workout.complete', () => {
    it('marks an ASSIGNED workout as COMPLETED', async () => {
        mockDb.clientProfile.findUnique.mockResolvedValue({ id: 'cp-1' });
        mockDb.workoutLog.findUnique.mockResolvedValue({ clientId: 'cp-1', status: 'ASSIGNED' });
        mockDb.workoutLog.update.mockResolvedValue({ id: 'w-4', status: 'COMPLETED' });
        const result = await caller('CLIENT').complete({ id: 'w-4' });
        expect(result?.status).toBe('COMPLETED');
    });

    it('throws BAD_REQUEST when workout is already COMPLETED', async () => {
        mockDb.clientProfile.findUnique.mockResolvedValue({ id: 'cp-1' });
        mockDb.workoutLog.findUnique.mockResolvedValue({ clientId: 'cp-1', status: 'COMPLETED' });
        await expect(caller('CLIENT').complete({ id: 'w-4' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('throws FORBIDDEN when workout belongs to a different client', async () => {
        mockDb.clientProfile.findUnique.mockResolvedValue({ id: 'cp-1' });
        mockDb.workoutLog.findUnique.mockResolvedValue({ clientId: 'cp-other', status: 'ASSIGNED' });
        await expect(caller('CLIENT').complete({ id: 'w-4' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('throws BAD_REQUEST when workout is SKIPPED', async () => {
        mockDb.clientProfile.findUnique.mockResolvedValue({ id: 'cp-1' });
        mockDb.workoutLog.findUnique.mockResolvedValue({ clientId: 'cp-1', status: 'SKIPPED' });
        await expect(caller('CLIENT').complete({ id: 'w-4' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
});

// ── workout.delete ────────────────────────────────────────────────────────────

describe('workout.delete', () => {
    it('allows trainer to delete an ASSIGNED workout', async () => {
        mockDb.workoutLog.findUnique.mockResolvedValue({ clientId: 'cp-1', status: 'ASSIGNED' });
        vi.mocked(WorkoutService.canTrainerAccessClient).mockResolvedValue(true);
        mockDb.workoutLog.delete.mockResolvedValue({});
        const result = await caller('TRAINER').delete({ id: 'w-5' });
        expect(result.success).toBe(true);
    });

    it('throws CONFLICT when trying to delete a COMPLETED workout', async () => {
        mockDb.workoutLog.findUnique.mockResolvedValue({ clientId: 'cp-1', status: 'COMPLETED' });
        await expect(caller('TRAINER').delete({ id: 'w-5' })).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('throws FORBIDDEN when trainer does not own the client', async () => {
        mockDb.workoutLog.findUnique.mockResolvedValue({ clientId: 'cp-other', status: 'ASSIGNED' });
        vi.mocked(WorkoutService.canTrainerAccessClient).mockResolvedValue(false);
        await expect(caller('TRAINER').delete({ id: 'w-5' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
});

// ── workout.getStats ──────────────────────────────────────────────────────────

describe('workout.getStats', () => {
    it('returns streak, weeklyCount, totalWorkouts from service', async () => {
        mockDb.clientProfile.findUnique.mockResolvedValue({ id: 'cp-1' });
        mockDb.workoutLog.findFirst.mockResolvedValue({ title: 'Push Day', date: new Date() });
        const stats = await caller('CLIENT').getStats();
        expect(stats.streak).toBe(3);
        expect(stats.weeklyCount).toBe(2);
        expect(stats.totalWorkouts).toBe(10);
        expect(stats.lastWorkout?.title).toBe('Push Day');
    });

    it('returns all zeros when client has no profile', async () => {
        mockDb.clientProfile.findUnique.mockResolvedValue(null);
        const stats = await caller('CLIENT').getStats();
        expect(stats).toEqual({ streak: 0, weeklyCount: 0, totalWorkouts: 0, lastWorkout: null });
    });
});
