import { z } from 'zod';
import { router, protectedProcedure } from '../init';
import { TRPCError } from '@trpc/server';

export const workoutRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        clientId: z.string().optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { page, limit } = input;
      const userId = ctx.session.user.id;
      const role = ctx.session.user.role;

      let clientProfileId: string | undefined;

      if (role === 'CLIENT') {
        const profile = await ctx.db.clientProfile.findUnique({
          where: { userId },
          select: { id: true },
        });
        clientProfileId = profile?.id;
      } else if (input.clientId) {
        clientProfileId = input.clientId;
      }

      if (!clientProfileId) {
        return { workouts: [], total: 0, page, totalPages: 0 };
      }

      const where = { clientId: clientProfileId };

      const [workouts, total] = await Promise.all([
        ctx.db.workoutLog.findMany({
          where,
          include: {
            exercises: {
              include: {
                exercise: { select: { name: true, primaryMuscle: true } },
                sets: true,
              },
              orderBy: { orderIndex: 'asc' },
            },
          },
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { date: 'desc' },
        }),
        ctx.db.workoutLog.count({ where }),
      ]);

      return { workouts, total, page, totalPages: Math.ceil(total / limit) };
    }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().optional(),
        notes: z.string().optional(),
        durationMin: z.number().optional(),
        exercises: z.array(
          z.object({
            exerciseId: z.string(),
            orderIndex: z.number(),
            notes: z.string().optional(),
            sets: z.array(
              z.object({
                setNumber: z.number(),
                reps: z.number().optional(),
                weightKg: z.number().optional(),
                rpe: z.number().min(1).max(10).optional(),
                durationSec: z.number().optional(),
                restSec: z.number().optional(),
                isWarmup: z.boolean().default(false),
                isDropSet: z.boolean().default(false),
              }),
            ),
          }),
        ),
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

      return ctx.db.workoutLog.create({
        data: {
          clientId: profile.id,
          title: input.title,
          notes: input.notes,
          durationMin: input.durationMin,
          exercises: {
            create: input.exercises.map((exercise) => ({
              exerciseId: exercise.exerciseId,
              orderIndex: exercise.orderIndex,
              notes: exercise.notes,
              sets: {
                create: exercise.sets,
              },
            })),
          },
        },
        include: {
          exercises: {
            include: { sets: true },
          },
        },
      });
    }),
});
