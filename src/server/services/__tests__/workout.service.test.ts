import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Prisma so tests never hit the DB ─────────────────────────────────────

const mockDb = {
    workoutLog: {
        findMany: vi.fn(),
        count: vi.fn(),
        findFirst: vi.fn(),
    },
    workoutSet: {
        findMany: vi.fn(),
    },
    trainerProfile: {
        findUnique: vi.fn(),
    },
    trainerClientMapping: {
        findFirst: vi.fn(),
    },
};

vi.mock('@/lib/db', () => ({ db: mockDb }));

import { WorkoutService } from '@/server/services/workout.service';

const DAY = 24 * 60 * 60 * 1000;

// Helper to build a fake workout-log date for N days ago
function daysAgo(n: number): Date {
    return new Date(Date.now() - n * DAY);
}

beforeEach(() => {
    vi.clearAllMocks();
});

// ── calculateStreak ───────────────────────────────────────────────────────────

describe('WorkoutService.calculateStreak', () => {
    it('returns 0 when there are no completed workouts', async () => {
        mockDb.workoutLog.findMany.mockResolvedValue([]);
        const streak = await WorkoutService.calculateStreak('client-1');
        expect(streak).toBe(0);
    });

    it('returns 1 for a single workout done today', async () => {
        mockDb.workoutLog.findMany.mockResolvedValue([{ date: new Date() }]);
        const streak = await WorkoutService.calculateStreak('client-1');
        expect(streak).toBe(1);
    });

    it('returns 1 for a single workout done yesterday (no workout today yet)', async () => {
        mockDb.workoutLog.findMany.mockResolvedValue([{ date: daysAgo(1) }]);
        const streak = await WorkoutService.calculateStreak('client-1');
        expect(streak).toBe(1);
    });

    it('returns 3 for consecutive workouts on today, yesterday, 2 days ago', async () => {
        mockDb.workoutLog.findMany.mockResolvedValue([
            { date: new Date() },
            { date: daysAgo(1) },
            { date: daysAgo(2) },
        ]);
        const streak = await WorkoutService.calculateStreak('client-1');
        expect(streak).toBe(3);
    });

    it('breaks streak on a gap — returns only the recent run', async () => {
        // Gap at day 3 — only days 0,1,2 should count
        mockDb.workoutLog.findMany.mockResolvedValue([
            { date: new Date() },
            { date: daysAgo(1) },
            { date: daysAgo(2) },
            // day 3 missing
            { date: daysAgo(4) },
        ]);
        const streak = await WorkoutService.calculateStreak('client-1');
        expect(streak).toBe(3);
    });

    it('de-duplicates multiple workouts on the same day', async () => {
        // Two logs on the same day should still count as 1
        mockDb.workoutLog.findMany.mockResolvedValue([
            { date: new Date() },
            { date: new Date() },
            { date: daysAgo(1) },
        ]);
        const streak = await WorkoutService.calculateStreak('client-1');
        expect(streak).toBe(2);
    });
});

// ── getWeeklyCount ────────────────────────────────────────────────────────────

describe('WorkoutService.getWeeklyCount', () => {
    it('returns count from db.workoutLog.count', async () => {
        mockDb.workoutLog.count.mockResolvedValue(4);
        const count = await WorkoutService.getWeeklyCount('client-1');
        expect(count).toBe(4);
        expect(mockDb.workoutLog.count).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ clientId: 'client-1', status: 'COMPLETED' }),
            }),
        );
    });

    it('passes a Monday-start date range in the where clause', async () => {
        mockDb.workoutLog.count.mockResolvedValue(0);
        await WorkoutService.getWeeklyCount('client-1');
        const call = mockDb.workoutLog.count.mock.calls[0][0];
        const { gte, lte } = call.where.date;
        // Monday must be <= now <= Sunday
        expect(gte.getUTCDay()).toBe(1); // Monday
        expect(lte.getUTCDay()).toBe(0); // Sunday
    });
});

// ── getTotalVolume ────────────────────────────────────────────────────────────

describe('WorkoutService.getTotalVolume', () => {
    it('sums reps × weightKg across all sets', async () => {
        mockDb.workoutSet.findMany.mockResolvedValue([
            { reps: 10, weightKg: 50 }, // 500
            { reps: 8, weightKg: 60 }, // 480
            { reps: 6, weightKg: 70 }, // 420
        ]);
        const volume = await WorkoutService.getTotalVolume('log-1');
        expect(volume).toBe(1400);
    });

    it('ignores sets with null reps or weight (bodyweight / cardio)', async () => {
        mockDb.workoutSet.findMany.mockResolvedValue([
            { reps: 10, weightKg: 50 }, // 500
            { reps: null, weightKg: null }, // ignored
            { reps: 15, weightKg: null }, // ignored
        ]);
        const volume = await WorkoutService.getTotalVolume('log-1');
        expect(volume).toBe(500);
    });

    it('returns 0 when there are no sets', async () => {
        mockDb.workoutSet.findMany.mockResolvedValue([]);
        const volume = await WorkoutService.getTotalVolume('log-1');
        expect(volume).toBe(0);
    });
});

// ── canTrainerAccessClient ────────────────────────────────────────────────────

describe('WorkoutService.canTrainerAccessClient', () => {
    it('returns true when an active mapping exists', async () => {
        mockDb.trainerProfile.findUnique.mockResolvedValue({ id: 'tp-1' });
        mockDb.trainerClientMapping.findFirst.mockResolvedValue({ id: 'map-1' });
        const result = await WorkoutService.canTrainerAccessClient('trainer-user', 'client-profile');
        expect(result).toBe(true);
    });

    it('returns false when trainer profile does not exist', async () => {
        mockDb.trainerProfile.findUnique.mockResolvedValue(null);
        const result = await WorkoutService.canTrainerAccessClient('trainer-user', 'client-profile');
        expect(result).toBe(false);
    });

    it('returns false when no active mapping exists', async () => {
        mockDb.trainerProfile.findUnique.mockResolvedValue({ id: 'tp-1' });
        mockDb.trainerClientMapping.findFirst.mockResolvedValue(null);
        const result = await WorkoutService.canTrainerAccessClient('trainer-user', 'client-profile');
        expect(result).toBe(false);
    });
});
