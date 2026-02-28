import 'server-only';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, trainerProcedure, adminProcedure } from '../init';
import { NotificationService } from '@/server/services/notification.service';

// ── Reusable select for returning trainer details to the admin UI ──────────────
const TRAINER_SELECT = {
  id: true,
  userId: true,
  bio: true,
  specialties: true,
  certifications: true,
  experience: true,
  status: true,
  profileCompleted: true,
  createdAt: true,
  user: {
    select: { id: true, name: true, email: true, image: true, status: true },
  },
  clientMappings: {
    where: { isActive: true },
    select: { id: true },
  },
} as const;

export const trainerRouter = router({
  // ── Own profile ─────────────────────────────────────────────────────────────

  // Fetches the authenticated trainer's own profile, creating a stub if missing
  getMyProfile: trainerProcedure.query(async ({ ctx }) => {
    const profile = await ctx.db.trainerProfile.upsert({
      where: { userId: ctx.session.user.id },
      create: { userId: ctx.session.user.id },
      update: {},
      select: {
        id: true,
        bio: true,
        specialties: true,
        certifications: true,
        experience: true,
        status: true,
        profileCompleted: true,
        availabilityBlocks: {
          orderBy: { startDate: 'asc' },
          select: { id: true, startDate: true, endDate: true, reason: true, isBlocked: true },
        },
      },
    });
    return profile;
  }),

  // Updates trainer bio, specialties, certs, and marks profile complete
  updateProfile: trainerProcedure
    .input(
      z.object({
        bio: z.string().max(2000).optional(),
        specialties: z
          .array(
            z.enum([
              'WEIGHT_LOSS', 'MUSCLE_GAIN', 'POWERLIFTING', 'CROSSFIT',
              'YOGA', 'REHABILITATION', 'NUTRITION', 'CARDIO',
              'FLEXIBILITY', 'SPORTS_PERFORMANCE',
            ]),
          )
          .default([]),
        certifications: z.array(z.string()).default([]),
        experience: z.number().int().min(0).max(50).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.trainerProfile.upsert({
        where: { userId: ctx.session.user.id },
        create: {
          userId: ctx.session.user.id,
          ...input,
          profileCompleted: true,
        },
        update: {
          ...input,
          profileCompleted: true,
        },
        select: { id: true, profileCompleted: true },
      });
    }),

  // ── Client roster ────────────────────────────────────────────────────────────

  // Returns the trainer's active clients with last workout stat for dashboard cards
  getClients: trainerProcedure.query(async ({ ctx }) => {
    const profile = await ctx.db.trainerProfile.findUnique({
      where: { userId: ctx.session.user.id },
      select: { id: true },
    });
    if (!profile) return [];

    const mappings = await ctx.db.trainerClientMapping.findMany({
      where: { trainerId: profile.id, isActive: true },
      orderBy: { startDate: 'desc' },
      include: {
        client: {
          include: {
            user: { select: { id: true, name: true, email: true, image: true } },
            workoutLogs: {
              where: { status: 'COMPLETED' },
              orderBy: { date: 'desc' },
              take: 1,
              select: { id: true, title: true, date: true },
            },
          },
        },
      },
    });

    return mappings.map((m) => ({
      mappingId: m.id,
      mappingType: m.type,
      startDate: m.startDate,
      clientProfileId: m.client.id,
      userId: m.client.user.id,
      name: m.client.user.name,
      email: m.client.user.email,
      image: m.client.user.image,
      fitnessGoals: m.client.fitnessGoals,
      profileCompleted: m.client.profileCompleted,
      lastWorkout: m.client.workoutLogs[0] ?? null,
    }));
  }),

  // Returns full detail for a single client — ownership-checked against trainer mapping
  getClientDetail: trainerProcedure
    .input(z.object({ clientProfileId: z.string() }))
    .query(async ({ ctx, input }) => {
      const trainerProfile = await ctx.db.trainerProfile.findUnique({
        where: { userId: ctx.session.user.id },
        select: { id: true },
      });
      if (!trainerProfile) throw new TRPCError({ code: 'NOT_FOUND', message: 'Trainer profile not found' });

      // Guard: trainer must have an active mapping with this client
      const mapping = await ctx.db.trainerClientMapping.findFirst({
        where: { trainerId: trainerProfile.id, clientId: input.clientProfileId, isActive: true },
      });
      if (!mapping) throw new TRPCError({ code: 'FORBIDDEN', message: 'Client not assigned to you' });

      return ctx.db.clientProfile.findUnique({
        where: { id: input.clientProfileId },
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
          workoutLogs: {
            where: { status: 'COMPLETED' },
            orderBy: { date: 'desc' },
            take: 10,
            select: { id: true, title: true, date: true, durationMin: true, status: true },
          },
          trainerMappings: {
            where: { isActive: true },
            select: { id: true, type: true, startDate: true },
          },
        },
      });
    }),

  // ── Admin — roster management ─────────────────────────────────────────────────

  // Returns all trainer profiles for admin assignment UI
  listAll: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.trainerProfile.findMany({
      select: TRAINER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }),

  // Returns all active mappings for the admin management table
  getMappings: adminProcedure
    .input(
      z.object({
        activeOnly: z.boolean().default(true),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where = input.activeOnly ? { isActive: true } : {};
      const [mappings, total] = await Promise.all([
        ctx.db.trainerClientMapping.findMany({
          where,
          skip: (input.page - 1) * input.limit,
          take: input.limit,
          orderBy: { createdAt: 'desc' },
          include: {
            trainer: {
              include: { user: { select: { id: true, name: true, email: true, image: true } } },
            },
            client: {
              include: { user: { select: { id: true, name: true, email: true, image: true } } },
            },
          },
        }),
        ctx.db.trainerClientMapping.count({ where }),
      ]);
      return { mappings, total, page: input.page, totalPages: Math.ceil(total / input.limit) };
    }),

  // Assigns a client to a trainer; prevents duplicate active mappings; fires notification
  assignClient: adminProcedure
    .input(
      z.object({
        trainerId: z.string(),
        clientId: z.string(),
        type: z.enum(['PRIMARY', 'TEMPORARY']).default('PRIMARY'),
        reason: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Guard: prevent duplicate active mapping
      const existing = await ctx.db.trainerClientMapping.findFirst({
        where: { trainerId: input.trainerId, clientId: input.clientId, isActive: true },
      });
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'This client is already assigned to this trainer' });

      const mapping = await ctx.db.trainerClientMapping.create({
        data: {
          trainerId: input.trainerId,
          clientId: input.clientId,
          type: input.type,
          isPrimary: input.type === 'PRIMARY',
          reason: input.reason,
        },
        include: {
          client: { include: { user: { select: { id: true } } } },
          trainer: { include: { user: { select: { id: true, name: true } } } },
        },
      });

      // Notify client that a trainer has been assigned — fire-and-forget so Pusher/FCM failures
      // never cause the mutation to return 500 (mapping is already persisted at this point)
      NotificationService.send({
        userId: mapping.client.user.id,
        type: 'PROGRAM_ASSIGNED',
        title: 'Trainer Assigned',
        message: `${mapping.trainer.user.name ?? 'A trainer'} has been assigned to coach you.`,
      }).catch((err) => console.error('[assignClient] notification failed:', err));

      return { id: mapping.id, trainerId: mapping.trainerId, clientId: mapping.clientId, type: mapping.type, isActive: mapping.isActive };

    }),

  // Deactivates a trainer-client mapping (soft delete preserves history)
  removeAssignment: adminProcedure
    .input(z.object({ mappingId: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const mapping = await ctx.db.trainerClientMapping.findUnique({ where: { id: input.mappingId } });
      if (!mapping) throw new TRPCError({ code: 'NOT_FOUND' });
      if (!mapping.isActive) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Mapping is already inactive' });

      return ctx.db.trainerClientMapping.update({
        where: { id: input.mappingId },
        data: { isActive: false, endDate: new Date(), reason: input.reason },
      });
    }),
});
