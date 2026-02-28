import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';

const mockDb = {
    trainerProfile: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        findMany: vi.fn(),
    },
    clientProfile: {
        findUnique: vi.fn(),
    },
    trainerClientMapping: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
    },
};

const mockNotify = vi.fn();

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/server/services/notification.service', () => ({
    NotificationService: { send: mockNotify },
}));

import { trainerRouter } from '../trainer';

function makeCtx(role: 'ADMIN' | 'TRAINER' = 'TRAINER') {
    return {
        db: mockDb as any,
        session: { user: { id: 'user-1', role } },
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

// ── getMyProfile ──────────────────────────────────────────────────────────────

describe('trainer.getMyProfile', () => {
    it('upserts and returns trainer profile', async () => {
        const fakeProfile = { id: 'tp-1', bio: 'test', specialties: [], certifications: [], experience: 5, status: 'active', profileCompleted: false, availabilityBlocks: [] };
        mockDb.trainerProfile.upsert.mockResolvedValue(fakeProfile);

        const caller = trainerRouter.createCaller(makeCtx('TRAINER') as any);
        const result = await caller.getMyProfile();

        expect(result).toEqual(fakeProfile);
        expect(mockDb.trainerProfile.upsert).toHaveBeenCalledWith(
            expect.objectContaining({ where: { userId: 'user-1' } }),
        );
    });
});

// ── updateProfile ─────────────────────────────────────────────────────────────

describe('trainer.updateProfile', () => {
    it('sets profileCompleted to true on update', async () => {
        mockDb.trainerProfile.upsert.mockResolvedValue({ id: 'tp-1', profileCompleted: true });

        const caller = trainerRouter.createCaller(makeCtx('TRAINER') as any);
        const result = await caller.updateProfile({
            bio: 'I am a trainer',
            specialties: ['WEIGHT_LOSS', 'CARDIO'],
            certifications: ['NASM-CPT'],
            experience: 5,
        });

        expect(result.profileCompleted).toBe(true);
        expect(mockDb.trainerProfile.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                update: expect.objectContaining({ profileCompleted: true }),
            }),
        );
    });
});

// ── getClients ────────────────────────────────────────────────────────────────

describe('trainer.getClients', () => {
    it('returns empty array when trainer has no profile', async () => {
        mockDb.trainerProfile.findUnique.mockResolvedValue(null);

        const caller = trainerRouter.createCaller(makeCtx('TRAINER') as any);
        const result = await caller.getClients();
        expect(result).toEqual([]);
    });

    it('returns mapped clients with last workout', async () => {
        mockDb.trainerProfile.findUnique.mockResolvedValue({ id: 'tp-1' });
        mockDb.trainerClientMapping.findMany.mockResolvedValue([
            {
                id: 'map-1',
                type: 'PRIMARY',
                startDate: new Date(),
                client: {
                    id: 'cp-1',
                    fitnessGoals: ['BUILD_MUSCLE'],
                    profileCompleted: true,
                    user: { id: 'u-2', name: 'Alice', email: 'alice@test.com', image: null },
                    workoutLogs: [{ id: 'wl-1', title: 'Push Day', date: new Date() }],
                },
            },
        ]);

        const caller = trainerRouter.createCaller(makeCtx('TRAINER') as any);
        const result = await caller.getClients();
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Alice');
        expect(result[0].lastWorkout?.title).toBe('Push Day');
    });
});

// ── assignClient ──────────────────────────────────────────────────────────────

describe('trainer.assignClient', () => {
    it('creates mapping and fires notification', async () => {
        mockDb.trainerClientMapping.findFirst.mockResolvedValue(null); // no duplicate
        mockDb.trainerClientMapping.create.mockResolvedValue({
            id: 'map-1',
            client: { user: { id: 'u-client' } },
            trainer: { user: { id: 'u-trainer', name: 'Coach Bob' } },
        });

        const caller = trainerRouter.createCaller(makeCtx('ADMIN') as any);
        await caller.assignClient({ trainerId: 'tp-1', clientId: 'cp-1', type: 'PRIMARY' });

        expect(mockDb.trainerClientMapping.create).toHaveBeenCalled();
        expect(mockNotify).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'PROGRAM_ASSIGNED', userId: 'u-client' }),
        );
    });

    it('throws CONFLICT when active mapping already exists', async () => {
        mockDb.trainerClientMapping.findFirst.mockResolvedValue({ id: 'existing-map' });

        const caller = trainerRouter.createCaller(makeCtx('ADMIN') as any);
        await expect(
            caller.assignClient({ trainerId: 'tp-1', clientId: 'cp-1', type: 'PRIMARY' }),
        ).rejects.toThrow(TRPCError);
    });

    it('throws FORBIDDEN for TRAINER role', async () => {
        const caller = trainerRouter.createCaller(makeCtx('TRAINER') as any);
        await expect(
            caller.assignClient({ trainerId: 'tp-1', clientId: 'cp-1', type: 'PRIMARY' }),
        ).rejects.toThrow(TRPCError);
    });
});

// ── removeAssignment ──────────────────────────────────────────────────────────

describe('trainer.removeAssignment', () => {
    it('deactivates mapping and sets endDate', async () => {
        mockDb.trainerClientMapping.findUnique.mockResolvedValue({ id: 'map-1', isActive: true });
        mockDb.trainerClientMapping.update.mockResolvedValue({ id: 'map-1', isActive: false });

        const caller = trainerRouter.createCaller(makeCtx('ADMIN') as any);
        const result = await caller.removeAssignment({ mappingId: 'map-1' });
        expect(result.isActive).toBe(false);
    });

    it('throws BAD_REQUEST if mapping is already inactive', async () => {
        mockDb.trainerClientMapping.findUnique.mockResolvedValue({ id: 'map-1', isActive: false });

        const caller = trainerRouter.createCaller(makeCtx('ADMIN') as any);
        await expect(
            caller.removeAssignment({ mappingId: 'map-1' }),
        ).rejects.toThrow(TRPCError);
    });

    it('throws NOT_FOUND for unknown mapping', async () => {
        mockDb.trainerClientMapping.findUnique.mockResolvedValue(null);

        const caller = trainerRouter.createCaller(makeCtx('ADMIN') as any);
        await expect(
            caller.removeAssignment({ mappingId: 'unknown' }),
        ).rejects.toThrow(TRPCError);
    });
});
