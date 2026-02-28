import { z } from 'zod';
import { router, adminProcedure, protectedProcedure } from '../init';

export const userRouter = router({
  list: adminProcedure
    .input(
      z.object({
        role: z.enum(['ADMIN', 'TRAINER', 'CLIENT']).optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { role, page, limit } = input;
      const where = role ? { role } : {};

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
          },
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        ctx.db.user.count({ where }),
      ]);

      return { users, total, page, totalPages: Math.ceil(total / limit) };
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
});
