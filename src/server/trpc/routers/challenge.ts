import 'server-only';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure } from '../init';
import { writeAudit } from '@/lib/audit';

export const challengeRouter = router({
  // Lists challenges; defaults to ACTIVE — includes current user's participation status
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.challenge.findMany({
        where: input.status ? { status: input.status } : { status: 'ACTIVE' },
        include: {
          _count: { select: { participants: { where: { optedOut: false } } } },
          // Returns 0 or 1 row for the caller — used by the UI to show joined state
          participants: {
            where: { userId: ctx.session.user.id },
            select: { optedOut: true },
          },
        },
        orderBy: { startDate: 'desc' },
      });
    }),

  // Admin-only: lists all challenges across all statuses for the management page
  listAll: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.challenge.findMany({
      include: {
        _count: { select: { participants: { where: { optedOut: false } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }),

  // Admin creates a challenge in DRAFT status by default
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        type: z.enum(['WORKOUT_COUNT', 'TOTAL_VOLUME', 'STREAK', 'HABIT_CONSISTENCY', 'CUSTOM']),
        startDate: z.string(),
        endDate: z.string(),
        rules: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.challenge.create({
        data: {
          name: input.name,
          description: input.description,
          type: input.type,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rules: input.rules as any,
        },
      });
    }),

  // Transitions a DRAFT challenge to ACTIVE so clients can join and compete
  activate: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const challenge = await ctx.db.challenge.findUnique({ where: { id: input.id } });
      if (!challenge) throw new TRPCError({ code: 'NOT_FOUND' });
      if (challenge.status !== 'DRAFT')
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only DRAFT challenges can be activated' });

      const activated = await ctx.db.challenge.update({
        where: { id: input.id },
        data: { status: 'ACTIVE' },
      });
      writeAudit(ctx.db, ctx.session.user.id, 'CHALLENGE_ACTIVATE', 'Challenge', input.id, {
        name: challenge.name,
      });
      return activated;
    }),

  // Cancels a DRAFT or ACTIVE challenge (preserves history, does not delete)
  cancel: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const challenge = await ctx.db.challenge.findUnique({ where: { id: input.id } });
      if (!challenge) throw new TRPCError({ code: 'NOT_FOUND' });
      if (!['DRAFT', 'ACTIVE'].includes(challenge.status))
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Challenge cannot be cancelled' });

      const cancelled = await ctx.db.challenge.update({
        where: { id: input.id },
        data: { status: 'CANCELLED' },
      });
      writeAudit(ctx.db, ctx.session.user.id, 'CHALLENGE_CANCEL', 'Challenge', input.id, {
        name: challenge.name,
        previousStatus: challenge.status,
      });
      return cancelled;
    }),

  // Client joins an ACTIVE challenge; guard prevents duplicate active participation
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

      // Upsert: re-activates if the user previously opted out of this challenge
      return ctx.db.challengeParticipant.upsert({
        where: { challengeId_userId: { challengeId: input.challengeId, userId: ctx.session.user.id } },
        create: { challengeId: input.challengeId, userId: ctx.session.user.id },
        update: { optedOut: false },
      });
    }),

  // Client opts out of a challenge they have joined (soft: preserves history)
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

  // Computes live scores for all participants; supports WORKOUT_COUNT and TOTAL_VOLUME types
  // Scores for STREAK / HABIT_CONSISTENCY / CUSTOM are shown as 0 (requires separate tracking)
  getLeaderboard: protectedProcedure
    .input(z.object({ challengeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const challenge = await ctx.db.challenge.findUnique({
        where: { id: input.challengeId },
        select: { type: true, startDate: true, endDate: true },
      });
      if (!challenge) throw new TRPCError({ code: 'NOT_FOUND' });

      // Fetch all active participants with their client profile ID (for workout log joins)
      const participants = await ctx.db.challengeParticipant.findMany({
        where: { challengeId: input.challengeId, optedOut: false },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
              clientProfile: { select: { id: true } },
            },
          },
        },
      });

      if (participants.length === 0) return [];

      const scoreByUserId = new Map<string, number>();

      // Only workout-based types can be auto-scored from workout logs
      if (challenge.type === 'WORKOUT_COUNT' || challenge.type === 'TOTAL_VOLUME') {
        const clientProfileIds = participants
          .map((p) => p.user.clientProfile?.id)
          .filter(Boolean) as string[];

        if (clientProfileIds.length > 0) {
          // Single batch query — fetch logs with sets for volume calculation
          const logs = await ctx.db.workoutLog.findMany({
            where: {
              clientId: { in: clientProfileIds },
              status: 'COMPLETED',
              date: { gte: challenge.startDate, lte: challenge.endDate },
            },
            select: {
              clientId: true,
              exercises: {
                select: {
                  sets: {
                    where: { isWarmup: false },
                    select: { reps: true, weightKg: true },
                  },
                },
              },
            },
          });

          // Build reverse map: clientProfileId → userId
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
              // TOTAL_VOLUME: Σ weightKg × reps across all working sets
              const vol = log.exercises
                .flatMap((e) => e.sets)
                .reduce((sum, s) => sum + (s.weightKg ?? 0) * (s.reps ?? 0), 0);
              scoreByUserId.set(uid, (scoreByUserId.get(uid) ?? 0) + vol);
            }
          }
        }
      }

      // Sort by score descending and assign sequential ranks
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
