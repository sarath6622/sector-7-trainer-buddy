import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../init';

export const challengeRouter = router({
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
          _count: { select: { participants: true } },
        },
        orderBy: { startDate: 'desc' },
      });
    }),

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

  join: protectedProcedure
    .input(z.object({ challengeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.challengeParticipant.create({
        data: {
          challengeId: input.challengeId,
          userId: ctx.session.user.id,
        },
      });
    }),
});
