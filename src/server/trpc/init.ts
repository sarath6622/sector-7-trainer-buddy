import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import type { UserRole } from '@/generated/prisma/enums';

export const createTRPCContext = async () => {
  const session = await auth();
  return { session, db };
};

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({
    ctx: {
      session: { ...ctx.session, user: ctx.session.user },
    },
  });
});

const hasRole = (allowedRoles: UserRole[]) =>
  t.middleware(({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }
    if (!allowedRoles.includes(ctx.session.user.role as UserRole)) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    return next({
      ctx: {
        session: { ...ctx.session, user: ctx.session.user },
      },
    });
  });

export const protectedProcedure = t.procedure.use(isAuthed);
export const adminProcedure = t.procedure.use(hasRole(['ADMIN']));
export const trainerProcedure = t.procedure.use(hasRole(['ADMIN', 'TRAINER']));
export const clientProcedure = t.procedure.use(hasRole(['ADMIN', 'TRAINER', 'CLIENT']));
