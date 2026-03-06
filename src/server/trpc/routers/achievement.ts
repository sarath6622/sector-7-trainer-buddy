import 'server-only';
import { z } from 'zod';
import { router, clientProcedure, trainerProcedure } from '../init';
import { NotificationService } from '@/server/services/notification.service';
import { AchievementType } from '@/generated/prisma/enums';
import type { db as DbType } from '@/lib/db';

type Db = typeof DbType;

// ─── Achievement Metadata ─────────────────────────────────────────────────────

// Static metadata for each badge type — merged into query results so the client
// receives display-ready data without needing its own lookup table.
const ACHIEVEMENT_META: Record<AchievementType, { emoji: string; title: string; description: string }> = {
  FIRST_WORKOUT: {
    emoji: '🏋️',
    title: 'First Workout!',
    description: "You've completed your very first workout. The journey begins!",
  },
  STREAK_7: {
    emoji: '🔥',
    title: '7-Day Streak!',
    description: 'You worked out 7 days in a row. Incredible consistency!',
  },
  STREAK_30: {
    emoji: '🔥',
    title: '30-Day Streak!',
    description: 'A full month of daily workouts. You are unstoppable!',
  },
  STREAK_100: {
    emoji: '🏆',
    title: '100-Day Streak!',
    description: 'One hundred days straight. Legendary dedication.',
  },
  WORKOUTS_10: {
    emoji: '✅',
    title: '10 Workouts Done!',
    description: 'Ten workouts completed. Building a great habit!',
  },
  WORKOUTS_50: {
    emoji: '💪',
    title: '50 Workouts Done!',
    description: 'Fifty workouts in the books. Halfway to a century!',
  },
  WORKOUTS_100: {
    emoji: '🎯',
    title: '100 Workouts Done!',
    description: 'One hundred workouts completed. Elite status achieved.',
  },
};

// ─── Award Helper ─────────────────────────────────────────────────────────────

// Awards a badge only if not already earned — idempotent via unique constraint check.
// Called from workout.ts after each log/complete; never throws so callers always succeed.
export async function awardAchievement(
  db: Db,
  userId: string,
  type: AchievementType,
): Promise<void> {
  const existing = await db.userAchievement.findUnique({
    where: { userId_type: { userId, type } },
  });
  if (existing) return;

  await db.userAchievement.create({ data: { userId, type } });

  const meta = ACHIEVEMENT_META[type];
  NotificationService.send({
    userId,
    type: 'ACHIEVEMENT',
    title: `${meta.emoji} ${meta.title}`,
    message: meta.description,
    data: { achievementType: type },
  }).catch((err) => console.error('[achievement] notification failed:', err));
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const achievementRouter = router({
  // Returns the caller's earned badges, enriched with display metadata
  list: clientProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.userAchievement.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { earnedAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      earnedAt: row.earnedAt,
      ...ACHIEVEMENT_META[row.type],
    }));
  }),

  // Trainer/admin views a specific user's earned badges
  getAll: trainerProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.userAchievement.findMany({
        where: { userId: input.userId },
        orderBy: { earnedAt: 'desc' },
      });
      return rows.map((row) => ({
        id: row.id,
        type: row.type,
        earnedAt: row.earnedAt,
        ...ACHIEVEMENT_META[row.type],
      }));
    }),
});
