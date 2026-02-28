import 'server-only';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, clientProcedure, trainerProcedure } from '../init';

export const profileRouter = router({
    // Returns the client's assigned primary trainer card (or null if unmapped)
    getMyTrainer: clientProcedure.query(async ({ ctx }) => {
        const clientProfile = await ctx.db.clientProfile.findUnique({
            where: { userId: ctx.session.user.id },
            select: { id: true },
        });
        if (!clientProfile) return null;

        const mapping = await ctx.db.trainerClientMapping.findFirst({
            where: { clientId: clientProfile.id, isActive: true, isPrimary: true },
            include: {
                trainer: {
                    include: {
                        user: { select: { id: true, name: true, email: true, image: true } },
                    },
                },
            },
            orderBy: { startDate: 'desc' },
        });

        if (!mapping) return null;

        return {
            mappingId: mapping.id,
            type: mapping.type,
            startDate: mapping.startDate,
            trainerId: mapping.trainer.id,
            name: mapping.trainer.user.name,
            email: mapping.trainer.user.email,
            image: mapping.trainer.user.image,
            bio: mapping.trainer.bio,
            specialties: mapping.trainer.specialties,
            experience: mapping.trainer.experience,
        };
    }),

    // Updates the client's own profile and marks it as completed
    updateClient: clientProcedure
        .input(
            z.object({
                dateOfBirth: z.string().optional(), // ISO date string
                gender: z.enum(['MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY']).optional(),
                heightCm: z.number().min(50).max(300).optional(),
                weightKg: z.number().min(20).max(500).optional(),
                fitnessGoals: z
                    .array(
                        z.enum([
                            'LOSE_WEIGHT', 'BUILD_MUSCLE', 'IMPROVE_ENDURANCE',
                            'INCREASE_FLEXIBILITY', 'BUILD_STRENGTH',
                            'IMPROVE_HEALTH', 'SPORT_PERFORMANCE', 'OTHER',
                        ]),
                    )
                    .default([]),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const { dateOfBirth, ...rest } = input;
            return ctx.db.clientProfile.upsert({
                where: { userId: ctx.session.user.id },
                create: {
                    userId: ctx.session.user.id,
                    ...rest,
                    dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
                    profileCompleted: true,
                },
                update: {
                    ...rest,
                    dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
                    profileCompleted: true,
                },
                select: { id: true, profileCompleted: true, fitnessGoals: true, heightCm: true, weightKg: true },
            });
        }),

    // Returns the client's own profile data (for the profile page form pre-fill)
    getMyClientProfile: clientProcedure.query(async ({ ctx }) => {
        return ctx.db.clientProfile.upsert({
            where: { userId: ctx.session.user.id },
            create: { userId: ctx.session.user.id },
            update: {},
            select: {
                id: true,
                dateOfBirth: true,
                gender: true,
                heightCm: true,
                weightKg: true,
                fitnessGoals: true,
                profileCompleted: true,
            },
        });
    }),

    // Trainer views a client's profile details — ownership-checked against active mapping
    getClientProfile: trainerProcedure
        .input(z.object({ clientProfileId: z.string() }))
        .query(async ({ ctx, input }) => {
            const trainerProfile = await ctx.db.trainerProfile.findUnique({
                where: { userId: ctx.session.user.id },
                select: { id: true },
            });
            if (!trainerProfile) throw new TRPCError({ code: 'NOT_FOUND', message: 'Trainer profile not found' });

            const hasAccess = await ctx.db.trainerClientMapping.findFirst({
                where: { trainerId: trainerProfile.id, clientId: input.clientProfileId, isActive: true },
            });
            if (!hasAccess) throw new TRPCError({ code: 'FORBIDDEN', message: 'Client not assigned to you' });

            return ctx.db.clientProfile.findUnique({
                where: { id: input.clientProfileId },
                select: {
                    id: true,
                    dateOfBirth: true,
                    gender: true,
                    heightCm: true,
                    weightKg: true,
                    fitnessGoals: true,
                    profileCompleted: true,
                    user: { select: { id: true, name: true, email: true, image: true } },
                },
            });
        }),
});
