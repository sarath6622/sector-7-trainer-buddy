import { z } from 'zod';
import { router, trainerProcedure, clientProcedure } from '../init';
import { TRPCError } from '@trpc/server';
import { WorkoutService } from '@/server/services/workout.service';
import { NotificationService } from '@/server/services/notification.service';

// Reusable Zod schema for a single set — shared between assign and log mutations
const setSchema = z.object({
  setNumber: z.number().min(1),
  reps: z.number().min(0).optional(),
  weightKg: z.number().min(0).optional(),
  rpe: z.number().min(1).max(10).optional(),
  durationSec: z.number().min(0).optional(),
  restSec: z.number().min(0).optional(),
  isWarmup: z.boolean().default(false),
  isDropSet: z.boolean().default(false),
});

// Reusable Zod schema for an exercise entry inside a workout
const workoutExerciseSchema = z.object({
  exerciseId: z.string(),
  orderIndex: z.number().min(0),
  notes: z.string().optional(),
  sets: z.array(setSchema).min(1),
});

export const workoutRouter = router({
  // Lists workouts for the calling client, or for a specific client if called by trainer/admin
  list: clientProcedure
    .input(
      z.object({
        clientId: z.string().optional(),
        status: z.enum(['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED']).optional(),
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
        // Client always sees only their own logs
        const profile = await ctx.db.clientProfile.findUnique({
          where: { userId },
          select: { id: true },
        });
        clientProfileId = profile?.id;
      } else if (input.clientId) {
        // Trainer/admin can specify a client — guard: trainer must own this client
        if (role === 'TRAINER') {
          const hasAccess = await WorkoutService.canTrainerAccessClient(userId, input.clientId);
          if (!hasAccess) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Client not assigned to you' });
          }
        }
        clientProfileId = input.clientId;
      }

      if (!clientProfileId) {
        return { workouts: [], total: 0, page, totalPages: 0 };
      }

      const where = {
        clientId: clientProfileId,
        ...(input.status && { status: input.status }),
      };

      const [workouts, total] = await Promise.all([
        ctx.db.workoutLog.findMany({
          where,
          include: {
            exercises: {
              include: {
                exercise: { select: { name: true, primaryMuscle: true, category: true } },
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

  // Fetches a single workout log with full exercise + set detail; client can only access their own
  getById: clientProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const workout = await ctx.db.workoutLog.findUnique({
        where: { id: input.id },
        include: {
          exercises: {
            include: {
              exercise: {
                select: { name: true, primaryMuscle: true, category: true, mediaUrl: true, mediaType: true },
              },
              sets: { orderBy: { setNumber: 'asc' } },
            },
            orderBy: { orderIndex: 'asc' },
          },
        },
      });

      if (!workout) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Workout not found' });
      }

      const role = ctx.session.user.role;
      if (role === 'CLIENT') {
        // Ensure client can only see their own logs
        const profile = await ctx.db.clientProfile.findUnique({
          where: { userId: ctx.session.user.id },
          select: { id: true },
        });
        if (workout.clientId !== profile?.id) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
      } else if (role === 'TRAINER') {
        const hasAccess = await WorkoutService.canTrainerAccessClient(
          ctx.session.user.id,
          workout.clientId,
        );
        if (!hasAccess) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Client not assigned to you' });
        }
      }

      return workout;
    }),

  // Trainer creates an ASSIGNED workout template for a specific client and fires a push notification
  assign: trainerProcedure
    .input(
      z.object({
        clientId: z.string(),
        title: z.string().min(1),
        notes: z.string().optional(),
        scheduledAt: z.string().datetime().optional(),
        exercises: z.array(workoutExerciseSchema).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const trainerUserId = ctx.session.user.id;

      // Guard: trainer can only assign to clients mapped to them
      const hasAccess = await WorkoutService.canTrainerAccessClient(trainerUserId, input.clientId);
      if (!hasAccess) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Client not assigned to you' });
      }

      const trainerProfile = await ctx.db.trainerProfile.findUnique({
        where: { userId: trainerUserId },
        select: { id: true },
      });

      const workout = await ctx.db.workoutLog.create({
        data: {
          clientId: input.clientId,
          title: input.title,
          notes: input.notes,
          assignedByTrainerId: trainerProfile?.id,
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
          status: 'ASSIGNED',
          exercises: {
            create: input.exercises.map((ex) => ({
              exerciseId: ex.exerciseId,
              orderIndex: ex.orderIndex,
              notes: ex.notes,
              sets: { create: ex.sets },
            })),
          },
        },
        include: {
          exercises: { include: { sets: true, exercise: { select: { name: true } } } },
        },
      });

      // Fetch client's userId to send notification
      const clientProfile = await ctx.db.clientProfile.findUnique({
        where: { id: input.clientId },
        select: { userId: true },
      });

      if (clientProfile) {
        const trainerName = ctx.session.user.name ?? 'Your trainer';
        // Non-blocking — notification failure should not roll back the workout creation
        NotificationService.send({
          userId: clientProfile.userId,
          type: 'PROGRAM_ASSIGNED',
          title: 'New Workout Assigned',
          message: `${trainerName} assigned you a new workout: ${input.title}`,
          data: { workoutId: workout.id },
        }).catch((err) => console.error('Notification failed:', err));
      }

      return workout;
    }),

  // Client self-logs a completed workout from scratch (no trainer template needed)
  log: clientProcedure
    .input(
      z.object({
        title: z.string().optional(),
        notes: z.string().optional(),
        durationMin: z.number().min(1).optional(),
        exercises: z.array(workoutExerciseSchema).min(1),
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

      const workout = await ctx.db.workoutLog.create({
        data: {
          clientId: profile.id,
          title: input.title,
          notes: input.notes,
          durationMin: input.durationMin,
          status: 'COMPLETED',
          date: new Date(),
          exercises: {
            create: input.exercises.map((ex) => ({
              exerciseId: ex.exerciseId,
              orderIndex: ex.orderIndex,
              notes: ex.notes,
              sets: { create: ex.sets },
            })),
          },
        },
        include: { exercises: { include: { sets: true } } },
      });

      // Check for streak milestones and fire achievement notification
      await checkAndSendStreakNotification(profile.id, ctx.session.user.id);

      return workout;
    }),

  // Client marks an ASSIGNED workout as COMPLETED and saves actual logged set data
  complete: clientProcedure
    .input(
      z.object({
        id: z.string(),
        durationMin: z.number().min(1).optional(),
        notes: z.string().optional(),
        // Replace all exercise sets with the client's actual logged values
        exercises: z.array(workoutExerciseSchema),
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

      const existing = await ctx.db.workoutLog.findUnique({
        where: { id: input.id },
        select: { clientId: true, status: true },
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Workout not found' });
      }
      if (existing.clientId !== profile.id) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      // Guard: cannot re-complete or complete a skipped workout
      if (existing.status === 'COMPLETED' || existing.status === 'SKIPPED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot complete a workout with status: ${existing.status}`,
        });
      }

      // Delete old sets and replace with the client's actual logged values atomically
      await ctx.db.$transaction(async (tx) => {
        const workoutExercises = await tx.workoutExercise.findMany({
          where: { workoutLogId: input.id },
          select: { id: true },
        });
        const exerciseIds = workoutExercises.map((we) => we.id);

        await tx.workoutSet.deleteMany({ where: { workoutExerciseId: { in: exerciseIds } } });
        await tx.workoutExercise.deleteMany({ where: { workoutLogId: input.id } });

        await tx.workoutLog.update({
          where: { id: input.id },
          data: {
            status: 'COMPLETED',
            date: new Date(),
            durationMin: input.durationMin,
            notes: input.notes,
            exercises: {
              create: input.exercises.map((ex) => ({
                exerciseId: ex.exerciseId,
                orderIndex: ex.orderIndex,
                notes: ex.notes,
                sets: { create: ex.sets },
              })),
            },
          },
        });
      });

      await checkAndSendStreakNotification(profile.id, ctx.session.user.id);

      return ctx.db.workoutLog.findUnique({
        where: { id: input.id },
        include: { exercises: { include: { sets: true } } },
      });
    }),

  // Trainer removes an ASSIGNED (not yet completed) workout they created
  delete: trainerProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const workout = await ctx.db.workoutLog.findUnique({
        where: { id: input.id },
        select: { clientId: true, status: true, assignedByTrainerId: true },
      });

      if (!workout) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      // Guard: cannot delete a workout the client has already completed
      if (workout.status === 'COMPLETED') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Cannot delete a completed workout',
        });
      }
      // Guard: trainer must be the one who assigned it
      const hasAccess = await WorkoutService.canTrainerAccessClient(
        ctx.session.user.id,
        workout.clientId,
      );
      if (!hasAccess) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      await ctx.db.workoutLog.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // Returns streak, weekly count, and total workouts for the client dashboard stats cards
  getStats: clientProcedure.query(async ({ ctx }) => {
    const profile = await ctx.db.clientProfile.findUnique({
      where: { userId: ctx.session.user.id },
      select: { id: true },
    });

    if (!profile) {
      return { streak: 0, weeklyCount: 0, totalWorkouts: 0, lastWorkout: null };
    }

    const [streak, weeklyCount, totalWorkouts, lastWorkout] = await Promise.all([
      WorkoutService.calculateStreak(profile.id),
      WorkoutService.getWeeklyCount(profile.id),
      WorkoutService.getTotalWorkouts(profile.id),
      ctx.db.workoutLog.findFirst({
        where: { clientId: profile.id, status: 'COMPLETED' },
        orderBy: { date: 'desc' },
        select: { title: true, date: true },
      }),
    ]);

    return { streak, weeklyCount, totalWorkouts, lastWorkout };
  }),

  // Returns per-session max weight for a given exercise — powers the strength progression line chart
  getProgressData: clientProcedure
    .input(
      z.object({
        exerciseId: z.string(),
        weeks: z.number().min(1).max(52).default(12),
      }),
    )
    .query(async ({ ctx, input }) => {
      const profile = await ctx.db.clientProfile.findUnique({
        where: { userId: ctx.session.user.id },
        select: { id: true },
      });
      if (!profile) return [];

      const since = new Date();
      since.setDate(since.getDate() - input.weeks * 7);

      const workouts = await ctx.db.workoutLog.findMany({
        where: { clientId: profile.id, status: 'COMPLETED', date: { gte: since } },
        orderBy: { date: 'asc' },
        select: {
          date: true,
          exercises: {
            where: { exerciseId: input.exerciseId },
            select: { sets: { select: { weightKg: true, reps: true, isWarmup: true } } },
          },
        },
      });

      // For each session that included this exercise, pick the heaviest working set
      return workouts
        .filter((w) => w.exercises.length > 0)
        .map((w) => {
          const sets = w.exercises.flatMap((e) => e.sets).filter((s) => !s.isWarmup && s.weightKg);
          const best = sets.reduce(
            (max, s) => (s.weightKg! > (max.weightKg ?? 0) ? s : max),
            sets[0] ?? { weightKg: 0, reps: 0 },
          );
          return {
            date: w.date.toISOString().slice(0, 10),
            maxWeightKg: best.weightKg ?? 0,
            reps: best.reps ?? 0,
          };
        });
    }),

  // Returns weekly training volume (Σ sets × reps × weightKg) grouped by week — powers the bar chart
  getWeeklyVolume: clientProcedure
    .input(z.object({ weeks: z.number().min(1).max(52).default(12) }))
    .query(async ({ ctx, input }) => {
      const profile = await ctx.db.clientProfile.findUnique({
        where: { userId: ctx.session.user.id },
        select: { id: true },
      });
      if (!profile) return [];

      const since = new Date();
      since.setDate(since.getDate() - input.weeks * 7);

      const workouts = await ctx.db.workoutLog.findMany({
        where: { clientId: profile.id, status: 'COMPLETED', date: { gte: since } },
        orderBy: { date: 'asc' },
        select: {
          date: true,
          exercises: { select: { sets: { select: { weightKg: true, reps: true } } } },
        },
      });

      // Group by ISO week string (YYYY-Www) and sum volume; include weeks with zero workouts
      const weekMap = new Map<string, { volume: number; count: number }>();

      // Pre-fill all weeks in range so gaps show as zero bars
      for (let i = input.weeks - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i * 7);
        weekMap.set(isoWeek(d), { volume: 0, count: 0 });
      }

      for (const w of workouts) {
        const key = isoWeek(w.date);
        const entry = weekMap.get(key) ?? { volume: 0, count: 0 };
        const vol = w.exercises
          .flatMap((e) => e.sets)
          .reduce((sum, s) => sum + (s.weightKg ?? 0) * (s.reps ?? 0), 0);
        weekMap.set(key, { volume: entry.volume + vol, count: entry.count + 1 });
      }

      return Array.from(weekMap.entries()).map(([week, { volume, count }]) => ({
        week,
        weekLabel: weekLabel(week),
        volume: Math.round(volume),
        workoutCount: count,
      }));
    }),

  // Returns personal records: best working set per exercise the client has ever logged
  getPersonalRecords: clientProcedure.query(async ({ ctx }) => {
    const profile = await ctx.db.clientProfile.findUnique({
      where: { userId: ctx.session.user.id },
      select: { id: true },
    });
    if (!profile) return [];

    const exercises = await ctx.db.workoutExercise.findMany({
      where: { workoutLog: { clientId: profile.id, status: 'COMPLETED' } },
      select: {
        exercise: { select: { id: true, name: true, primaryMuscle: true } },
        sets: { select: { weightKg: true, reps: true, isWarmup: true } },
        workoutLog: { select: { date: true } },
      },
    });

    // For each unique exercise, find the heaviest working set ever logged
    const recordMap = new Map<
      string,
      { exerciseId: string; name: string; primaryMuscle: string; maxWeightKg: number; reps: number; date: string }
    >();

    for (const we of exercises) {
      const workingSets = we.sets.filter((s) => !s.isWarmup && s.weightKg && s.weightKg > 0);
      if (!workingSets.length) continue;

      const best = workingSets.reduce((max, s) => (s.weightKg! > max.weightKg! ? s : max));
      const existing = recordMap.get(we.exercise.id);

      if (!existing || best.weightKg! > existing.maxWeightKg) {
        recordMap.set(we.exercise.id, {
          exerciseId: we.exercise.id,
          name: we.exercise.name,
          primaryMuscle: we.exercise.primaryMuscle,
          maxWeightKg: best.weightKg!,
          reps: best.reps ?? 0,
          date: we.workoutLog.date.toISOString().slice(0, 10),
        });
      }
    }

    return Array.from(recordMap.values()).sort((a, b) => b.maxWeightKg - a.maxWeightKg);
  }),

  // Returns recent workout activity for all clients assigned to the calling trainer
  getTrainerOverview: trainerProcedure.query(async ({ ctx }) => {
    const trainerProfile = await ctx.db.trainerProfile.findUnique({
      where: { userId: ctx.session.user.id },
      select: { id: true },
    });

    if (!trainerProfile) return { clients: [] };

    const mappings = await ctx.db.trainerClientMapping.findMany({
      where: { trainerId: trainerProfile.id, isActive: true },
      include: {
        client: {
          include: {
            user: { select: { name: true, image: true } },
            workoutLogs: {
              where: { status: { in: ['ASSIGNED', 'COMPLETED'] } },
              orderBy: { date: 'desc' },
              take: 3,
              select: { id: true, title: true, status: true, date: true, scheduledAt: true },
            },
          },
        },
      },
    });

    return {
      clients: mappings.map((m) => ({
        clientProfileId: m.clientId,
        name: m.client.user.name,
        image: m.client.user.image,
        recentWorkouts: m.client.workoutLogs,
      })),
    };
  }),
});

// Returns the ISO week string (e.g. "2026-W10") for a given date
function isoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7; // Mon=1 … Sun=7
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// Returns a short human-readable label for an ISO week string (e.g. "Mar 3")
function weekLabel(isoWeekStr: string): string {
  const [year, week] = isoWeekStr.split('-W').map(Number);
  // ISO week 1 = week containing first Thursday of the year
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const weekStart = new Date(jan4.getTime() + (week - 1) * 7 * 86400000);
  weekStart.setUTCDate(weekStart.getUTCDate() - (weekStart.getUTCDay() || 7) + 1);
  return weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// Fires an ACHIEVEMENT notification when the client hits a streak milestone (7 or 30 days)
async function checkAndSendStreakNotification(
  clientProfileId: string,
  userId: string,
): Promise<void> {
  const streak = await WorkoutService.calculateStreak(clientProfileId);
  const milestones = [7, 30];

  if (milestones.includes(streak)) {
    NotificationService.send({
      userId,
      type: 'ACHIEVEMENT',
      title: `🔥 ${streak}-Day Streak!`,
      message: `Amazing! You've worked out ${streak} days in a row. Keep it up!`,
      data: { streak },
    }).catch((err) => console.error('Streak notification failed:', err));
  }
}
