import 'server-only';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { TRPCError } from '@trpc/server';
import { router, adminProcedure, protectedProcedure } from '../init';
import { writeAudit } from '@/lib/audit';

export const userRouter = router({
  // List users — filterable by role, paginated
  list: adminProcedure
    .input(
      z.object({
        // .nullish() = accepts null (tRPC serializes unset state as null) + undefined + absent
        role: z.enum(['ADMIN', 'TRAINER', 'CLIENT']).nullish(),
        search: z.string().nullish(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
      }),

    )
    .query(async ({ ctx, input }) => {
      const { role, page, limit, search } = input;
      const where = {
        ...(role ? { role } : {}),
        ...(search
          ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
          : {}),
      };

      const [users, total] = await Promise.all([
        ctx.db.user.findMany({
          where,
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
            image: true,
            createdAt: true,
            trainerProfile: { select: { id: true, profileCompleted: true } },
            clientProfile: { select: { id: true, profileCompleted: true } },
          },
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        ctx.db.user.count({ where }),
      ]);

      return { users, total, page, totalPages: Math.ceil(total / limit) };
    }),

  // Admin creates a user account directly — can set any role
  // Creates the matching profile stub so downstream relations work immediately
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(2, 'Name must be at least 2 characters'),
        email: z.email('Invalid email address'),
        password: z.string().min(8, 'Password must be at least 8 characters'),
        role: z.enum(['TRAINER', 'CLIENT']), // Admin cannot create another ADMIN here
        sendWelcomeEmail: z.boolean().default(false), // reserved for future email service
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Guard: prevent duplicate email addresses
      const existing = await ctx.db.user.findUnique({ where: { email: input.email } });
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Email already registered' });

      const passwordHash = await bcrypt.hash(input.password, 12);

      const created = await ctx.db.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          role: input.role,
          status: 'ACTIVE',
          // Immediately create the role-appropriate profile stub
          ...(input.role === 'TRAINER'
            ? { trainerProfile: { create: {} } }
            : { clientProfile: { create: {} } }),
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
        },
      });
      writeAudit(ctx.db, ctx.session.user.id, 'USER_CREATE', 'User', created.id, {
        name: created.name,
        email: created.email,
        role: created.role,
      });
      return created;
    }),

  // Admin updates a user's status (ACTIVE / SUSPENDED / INACTIVE)
  updateStatus: adminProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({ where: { id: input.id } });
      if (!user) throw new TRPCError({ code: 'NOT_FOUND' });

      const updated = await ctx.db.user.update({
        where: { id: input.id },
        data: { status: input.status },
        select: { id: true, status: true },
      });
      writeAudit(ctx.db, ctx.session.user.id, 'USER_STATUS_UPDATE', 'User', input.id, {
        newStatus: input.status,
      });
      return updated;
    }),

  // Soft-delete equivalent: set INACTIVE rather than destroy data
  deactivate: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({ where: { id: input.id } });
      if (!user) throw new TRPCError({ code: 'NOT_FOUND' });
      if (user.id === ctx.session.user.id)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot deactivate your own account' });

      const deactivated = await ctx.db.user.update({
        where: { id: input.id },
        data: { status: 'INACTIVE' },
        select: { id: true, status: true },
      });
      writeAudit(ctx.db, ctx.session.user.id, 'USER_DEACTIVATE', 'User', input.id);
      return deactivated;
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.user.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          image: true,
          createdAt: true,
          trainerProfile: true,
          clientProfile: true,
        },
      });
    }),

  // Single query for admin dashboard stat cards — avoids three separate round-trips
  getAdminStats: adminProcedure.query(async ({ ctx }) => {
    const [totalUsers, totalTrainers, totalExercises] = await Promise.all([
      ctx.db.user.count({ where: { role: 'CLIENT' } }),
      ctx.db.user.count({ where: { role: 'TRAINER' } }),
      ctx.db.exercise.count(),
    ]);

    return { totalUsers, totalTrainers, totalExercises };
  }),

  // Admin analytics — powers 4 chart panels: user growth, platform activity,
  // top exercises by usage, and per-trainer client/completion stats
  getAdminAnalytics: adminProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const twelveWeeksAgo = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Pre-build the last 12 ISO week keys so we can zero-fill gaps in charts
    const weekKeys: string[] = [];
    for (let w = 11; w >= 0; w--) {
      const d = new Date(now.getTime() - w * 7 * 24 * 60 * 60 * 1000);
      weekKeys.push(analyticsIsoWeek(d));
    }

    const [newClients, completedLogs, topExerciseGroups, trainerProfiles] = await Promise.all([
      // New CLIENT registrations in the last 12 weeks (for the growth chart)
      ctx.db.user.findMany({
        where: { role: 'CLIENT', createdAt: { gte: twelveWeeksAgo } },
        select: { createdAt: true },
      }),
      // All COMPLETED workout logs in the last 12 weeks (for platform activity chart)
      ctx.db.workoutLog.findMany({
        where: { status: 'COMPLETED', date: { gte: twelveWeeksAgo } },
        select: { date: true, clientId: true },
      }),
      // Top 10 exercises by number of WorkoutExercise entries ever logged
      ctx.db.workoutExercise.groupBy({
        by: ['exerciseId'],
        _count: { exerciseId: true },
        orderBy: { _count: { exerciseId: 'desc' } },
        take: 10,
      }),
      // All trainer profiles with their active client IDs and trainer name
      ctx.db.trainerProfile.findMany({
        select: {
          id: true,
          user: { select: { name: true } },
          clientMappings: { where: { isActive: true }, select: { clientId: true } },
        },
      }),
    ]);

    // ── User Growth: group new clients by ISO week, zero-fill gaps ───────────
    const growthMap = new Map<string, number>(weekKeys.map((k) => [k, 0]));
    for (const u of newClients) {
      const key = analyticsIsoWeek(new Date(u.createdAt));
      if (growthMap.has(key)) growthMap.set(key, (growthMap.get(key) ?? 0) + 1);
    }
    const userGrowth = weekKeys.map((k) => ({
      weekLabel: analyticsWeekLabel(k),
      newUsers: growthMap.get(k) ?? 0,
    }));

    // ── Platform Activity: group completed workouts by ISO week ──────────────
    const activityMap = new Map<string, number>(weekKeys.map((k) => [k, 0]));
    for (const log of completedLogs) {
      const key = analyticsIsoWeek(new Date(log.date));
      if (activityMap.has(key)) activityMap.set(key, (activityMap.get(key) ?? 0) + 1);
    }
    const platformActivity = weekKeys.map((k) => ({
      weekLabel: analyticsWeekLabel(k),
      workouts: activityMap.get(k) ?? 0,
    }));

    // ── Top Exercises: resolve exercise names for the grouped IDs ────────────
    const exerciseIds = topExerciseGroups.map((g) => g.exerciseId);
    const exercises = exerciseIds.length > 0
      ? await ctx.db.exercise.findMany({
          where: { id: { in: exerciseIds } },
          select: { id: true, name: true },
        })
      : [];
    const exerciseNameMap = new Map(exercises.map((e) => [e.id, e.name]));
    const topExercises = topExerciseGroups.map((g) => ({
      name: exerciseNameMap.get(g.exerciseId) ?? 'Unknown',
      count: g._count.exerciseId,
    }));

    // ── Trainer Comparison: batch-fetch last-30-day logs for all mapped clients
    const allClientIds = trainerProfiles.flatMap((t) => t.clientMappings.map((m) => m.clientId));
    const recentLogs = allClientIds.length > 0
      ? await ctx.db.workoutLog.findMany({
          where: { clientId: { in: allClientIds }, status: 'COMPLETED', date: { gte: thirtyDaysAgo } },
          select: { clientId: true },
        })
      : [];

    const completedByClient = new Map<string, number>();
    for (const log of recentLogs) {
      completedByClient.set(log.clientId, (completedByClient.get(log.clientId) ?? 0) + 1);
    }

    const trainerComparison = trainerProfiles
      .map((t) => {
        const clientIds = t.clientMappings.map((m) => m.clientId);
        const completedLast30 = clientIds.reduce(
          (sum, cid) => sum + (completedByClient.get(cid) ?? 0), 0,
        );
        return { name: t.user.name ?? 'Unknown', clientCount: clientIds.length, completedLast30 };
      })
      .sort((a, b) => b.completedLast30 - a.completedLast30);

    return { userGrowth, platformActivity, topExercises, trainerComparison };
  }),
});

// Returns the ISO week string (e.g. "2026-W10") for a given date
function analyticsIsoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7; // Mon=1 … Sun=7
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// Returns a short human-readable label for an ISO week string (e.g. "Mar 3")
function analyticsWeekLabel(isoWeekStr: string): string {
  const [year, week] = isoWeekStr.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const weekStart = new Date(jan4.getTime() + (week - 1) * 7 * 86400000);
  weekStart.setUTCDate(weekStart.getUTCDate() - (weekStart.getUTCDay() || 7) + 1);
  return weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
