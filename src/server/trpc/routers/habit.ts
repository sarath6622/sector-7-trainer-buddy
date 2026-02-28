import { z } from 'zod';
import { router, protectedProcedure } from '../init';
import { TRPCError } from '@trpc/server';

export const habitRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        startDate: z.string(),
        endDate: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const profile = await ctx.db.clientProfile.findUnique({
        where: { userId: ctx.session.user.id },
        select: { id: true },
      });

      if (!profile) return [];

      return ctx.db.habit.findMany({
        where: {
          clientId: profile.id,
          date: {
            gte: new Date(input.startDate),
            lte: new Date(input.endDate),
          },
        },
        orderBy: { date: 'desc' },
      });
    }),

  log: protectedProcedure
    .input(
      z.object({
        type: z.enum(['WATER', 'SLEEP', 'STEPS', 'PROTEIN', 'CALORIES', 'CUSTOM']),
        label: z.string().optional(),
        date: z.string(),
        value: z.number(),
        unit: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.db.clientProfile.findUnique({
        where: { userId: ctx.session.user.id },
        select: { id: true },
      });

      if (!profile) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Client profile not found' });
      }

      return ctx.db.habit.upsert({
        where: {
          clientId_type_date: {
            clientId: profile.id,
            type: input.type,
            date: new Date(input.date),
          },
        },
        update: { value: input.value, unit: input.unit, notes: input.notes },
        create: {
          clientId: profile.id,
          type: input.type,
          label: input.label,
          date: new Date(input.date),
          value: input.value,
          unit: input.unit,
          notes: input.notes,
        },
      });
    }),
});
