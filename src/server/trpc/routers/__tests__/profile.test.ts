import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';

const mockDb = {
    clientProfile: {
        upsert: vi.fn(),
        findUnique: vi.fn(),
    },
    trainerProfile: {
        findUnique: vi.fn(),
    },
    trainerClientMapping: {
        findFirst: vi.fn(),
    },
};

vi.mock('@/lib/db', () => ({ db: mockDb }));

import { profileRouter } from '../profile';

function makeCtx(role: 'CLIENT' | 'TRAINER' = 'CLIENT') {
    return {
        db: mockDb as any,
        session: { user: { id: 'user-1', role } },
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

// ── getMyClientProfile ────────────────────────────────────────────────────────

describe('profile.getMyClientProfile', () => {
    it('upserts and returns profile', async () => {
        const fakeProfile = { id: 'cp-1', dateOfBirth: null, gender: null, heightCm: null, weightKg: null, fitnessGoals: [], profileCompleted: false };
        mockDb.clientProfile.upsert.mockResolvedValue(fakeProfile);

        const caller = profileRouter.createCaller(makeCtx('CLIENT') as any);
        const result = await caller.getMyClientProfile();

        expect(result).toEqual(fakeProfile);
        expect(mockDb.clientProfile.upsert).toHaveBeenCalledWith(
            expect.objectContaining({ where: { userId: 'user-1' } }),
        );
    });
});

// ── updateClient ──────────────────────────────────────────────────────────────

describe('profile.updateClient', () => {
    it('updates profile and sets profileCompleted to true', async () => {
        mockDb.clientProfile.upsert.mockResolvedValue({ id: 'cp-1', profileCompleted: true, fitnessGoals: ['BUILD_MUSCLE'], heightCm: 175, weightKg: 75 });

        const caller = profileRouter.createCaller(makeCtx('CLIENT') as any);
        const result = await caller.updateClient({
            heightCm: 175,
            weightKg: 75,
            fitnessGoals: ['BUILD_MUSCLE'],
        });

        expect(result.profileCompleted).toBe(true);
        expect(mockDb.clientProfile.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                update: expect.objectContaining({ profileCompleted: true }),
            }),
        );
    });
});

// ── getMyTrainer ──────────────────────────────────────────────────────────────

describe('profile.getMyTrainer', () => {
    it('returns null when client has no profile', async () => {
        mockDb.clientProfile.findUnique.mockResolvedValue(null);

        const caller = profileRouter.createCaller(makeCtx('CLIENT') as any);
        const result = await caller.getMyTrainer();
        expect(result).toBeNull();
    });

    it('returns null when no active primary mapping', async () => {
        mockDb.clientProfile.findUnique.mockResolvedValue({ id: 'cp-1' });
        mockDb.trainerClientMapping.findFirst.mockResolvedValue(null);

        const caller = profileRouter.createCaller(makeCtx('CLIENT') as any);
        const result = await caller.getMyTrainer();
        expect(result).toBeNull();
    });

    it('returns trainer card when mapping exists', async () => {
        mockDb.clientProfile.findUnique.mockResolvedValue({ id: 'cp-1' });
        mockDb.trainerClientMapping.findFirst.mockResolvedValue({
            id: 'map-1',
            type: 'PRIMARY',
            startDate: new Date(),
            trainer: {
                id: 'tp-1',
                bio: 'Experienced coach',
                specialties: ['CARDIO'],
                experience: 10,
                user: { id: 'u-trainer', name: 'Coach Bob', email: 'bob@test.com', image: null },
            },
        });

        const caller = profileRouter.createCaller(makeCtx('CLIENT') as any);
        const result = await caller.getMyTrainer();
        expect(result).not.toBeNull();
        expect(result?.name).toBe('Coach Bob');
        expect(result?.specialties).toContain('CARDIO');
    });
});

// ── getClientProfile (trainer) ────────────────────────────────────────────────

describe('profile.getClientProfile', () => {
    it('throws NOT_FOUND when trainer has no profile', async () => {
        mockDb.trainerProfile.findUnique.mockResolvedValue(null);

        const caller = profileRouter.createCaller(makeCtx('TRAINER') as any);
        await expect(
            caller.getClientProfile({ clientProfileId: 'cp-1' }),
        ).rejects.toThrow(TRPCError);
    });

    it('throws FORBIDDEN when trainer is not mapped to the client', async () => {
        mockDb.trainerProfile.findUnique.mockResolvedValue({ id: 'tp-1' });
        mockDb.trainerClientMapping.findFirst.mockResolvedValue(null);

        const caller = profileRouter.createCaller(makeCtx('TRAINER') as any);
        await expect(
            caller.getClientProfile({ clientProfileId: 'cp-1' }),
        ).rejects.toThrow(TRPCError);
    });

    it('returns client profile when trainer has access', async () => {
        mockDb.trainerProfile.findUnique.mockResolvedValue({ id: 'tp-1' });
        mockDb.trainerClientMapping.findFirst.mockResolvedValue({ id: 'map-1' });
        mockDb.clientProfile.findUnique.mockResolvedValue({
            id: 'cp-1',
            heightCm: 175,
            weightKg: 75,
            fitnessGoals: ['BUILD_MUSCLE'],
            profileCompleted: true,
            dateOfBirth: null,
            gender: null,
            user: { id: 'u-c', name: 'Alice', email: 'alice@test.com', image: null },
        });

        const caller = profileRouter.createCaller(makeCtx('TRAINER') as any);
        const result = await caller.getClientProfile({ clientProfileId: 'cp-1' });
        expect(result?.heightCm).toBe(175);
        expect(result?.profileCompleted).toBe(true);
    });
});
