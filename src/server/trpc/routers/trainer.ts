import { z } from 'zod';
import { router, trainerProcedure, adminProcedure } from '../init';

export const trainerRouter = router({
  myClients: trainerProcedure.query(async ({ ctx }) => {
    const profile = await ctx.db.trainerProfile.findUnique({
      where: { userId: ctx.session.user.id },
      select: { id: true },
    });

    if (!profile) return [];

    const mappings = await ctx.db.trainerClientMapping.findMany({
      where: { trainerId: profile.id, isActive: true },
      include: {
        client: {
          include: {
            user: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        },
      },
    });

    return mappings;
  }),

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
      return ctx.db.trainerClientMapping.create({
        data: {
          trainerId: input.trainerId,
          clientId: input.clientId,
          type: input.type,
          isPrimary: input.type === 'PRIMARY',
          reason: input.reason,
        },
      });
    }),
});
