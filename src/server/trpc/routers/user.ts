import 'server-only';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { TRPCError } from '@trpc/server';
import { router, adminProcedure, protectedProcedure } from '../init';

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

      return ctx.db.user.create({
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

      return ctx.db.user.update({
        where: { id: input.id },
        data: { status: input.status },
        select: { id: true, status: true },
      });
    }),

  // Soft-delete equivalent: set INACTIVE rather than destroy data
  deactivate: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({ where: { id: input.id } });
      if (!user) throw new TRPCError({ code: 'NOT_FOUND' });
      if (user.id === ctx.session.user.id)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot deactivate your own account' });

      return ctx.db.user.update({
        where: { id: input.id },
        data: { status: 'INACTIVE' },
        select: { id: true, status: true },
      });
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
