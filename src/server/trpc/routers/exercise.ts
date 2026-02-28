import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure } from '../init';
import { MuscleGroup, ExerciseCategory, DifficultyLevel, Equipment } from '@/generated/prisma/enums';

// Reusable Zod schema for exercise fields — shared between create and update
const exerciseFieldsSchema = {
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  instructions: z.string().optional(),
  primaryMuscle: z.nativeEnum(MuscleGroup),
  secondaryMuscles: z.array(z.nativeEnum(MuscleGroup)).default([]),
  equipment: z.nativeEnum(Equipment).optional(),
  category: z.nativeEnum(ExerciseCategory),
  difficulty: z.nativeEnum(DifficultyLevel).default('INTERMEDIATE'),
  // mediaUrl accepts a URL string or empty string (to clear media)
  mediaUrl: z.string().url().optional().or(z.literal('')),
};

export const exerciseRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        primaryMuscle: z.nativeEnum(MuscleGroup).optional(),
        category: z.nativeEnum(ExerciseCategory).optional(),
        difficulty: z.nativeEnum(DifficultyLevel).optional(),
        equipment: z.nativeEnum(Equipment).optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(12),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { search, primaryMuscle, category, difficulty, equipment, page, limit } = input;
      const skip = (page - 1) * limit;

      const where = {
        ...(search && { name: { contains: search, mode: 'insensitive' as const } }),
        ...(primaryMuscle && { primaryMuscle }),
        ...(category && { category }),
        ...(difficulty && { difficulty }),
        ...(equipment && { equipment }),
      };

      const [exercises, total] = await ctx.db.$transaction([
        ctx.db.exercise.findMany({
          where,
          skip,
          take: limit,
          orderBy: { name: 'asc' },
          include: { createdBy: { select: { name: true } } },
        }),
        ctx.db.exercise.count({ where }),
      ]);

      return { exercises, total, page, totalPages: Math.ceil(total / limit) };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const exercise = await ctx.db.exercise.findUnique({
        where: { id: input.id },
        include: { createdBy: { select: { name: true } } },
      });

      if (!exercise) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Exercise not found' });
      }

      return exercise;
    }),

  create: adminProcedure
    .input(z.object(exerciseFieldsSchema))
    .mutation(async ({ ctx, input }) => {
      // Derive mediaType from URL so the client never has to set it manually
      const mediaType = input.mediaUrl ? detectMediaType(input.mediaUrl) : undefined;

      return ctx.db.exercise.create({
        data: {
          ...input,
          mediaUrl: input.mediaUrl || undefined,
          mediaType,
          createdById: ctx.session.user.id,
        },
      });
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        instructions: z.string().optional(),
        primaryMuscle: z.nativeEnum(MuscleGroup).optional(),
        secondaryMuscles: z.array(z.nativeEnum(MuscleGroup)).optional(),
        equipment: z.nativeEnum(Equipment).optional().nullable(),
        category: z.nativeEnum(ExerciseCategory).optional(),
        difficulty: z.nativeEnum(DifficultyLevel).optional(),
        mediaUrl: z.string().url().optional().or(z.literal('')),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, mediaUrl, ...rest } = input;

      // Verify exercise exists before updating
      const existing = await ctx.db.exercise.findUnique({ where: { id } });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Exercise not found' });
      }

      // Re-derive mediaType whenever mediaUrl is explicitly passed
      const mediaFields =
        mediaUrl !== undefined
          ? { mediaUrl: mediaUrl || null, mediaType: mediaUrl ? detectMediaType(mediaUrl) : null }
          : {};

      return ctx.db.exercise.update({
        where: { id },
        data: { ...rest, ...mediaFields },
      });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Guard: prevent deletion if exercise is referenced by any workout
      const inUse = await ctx.db.workoutExercise.findFirst({
        where: { exerciseId: input.id },
      });

      if (inUse) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Cannot delete an exercise that is used in existing workouts.',
        });
      }

      await ctx.db.exercise.delete({ where: { id: input.id } });
      return { success: true };
    }),
});

// Derives media type from URL pattern — keeps mediaType consistent without user input
function detectMediaType(url: string): 'youtube' | 'image' | 'video' {
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url)) return 'video';
  return 'image';
}
