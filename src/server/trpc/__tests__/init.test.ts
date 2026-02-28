import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import type { UserRole } from '@/generated/prisma/enums';

// ── Isolated tRPC instance for testing ───────────────────────────────────────
// We recreate the authorization middleware logic here in isolation so tests
// never touch NextAuth, Prisma, or any real infrastructure.

type TestSession = {
  user: { id: string; role: UserRole; email: string };
  expires: string;
} | null;

type TestContext = { session: TestSession; db: unknown };

const t = initTRPC.context<TestContext>().create({ transformer: superjson });

// Mirrors the hasRole middleware from src/server/trpc/init.ts
const hasRole = (allowedRoles: UserRole[]) =>
  t.middleware(({ ctx, next }) => {
    if (!ctx.session?.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
    if (!allowedRoles.includes(ctx.session.user.role)) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    return next({ ctx: { session: ctx.session, db: ctx.db } });
  });

const adminProcedure = t.procedure.use(hasRole(['ADMIN']));
const trainerProcedure = t.procedure.use(hasRole(['ADMIN', 'TRAINER']));
const clientProcedure = t.procedure.use(hasRole(['ADMIN', 'TRAINER', 'CLIENT']));

// A trivial router that lets us invoke each procedure type
const testRouter = t.router({
  adminOnly: adminProcedure.query(() => 'admin-ok'),
  trainerOnly: trainerProcedure.query(() => 'trainer-ok'),
  clientOnly: clientProcedure.query(() => 'client-ok'),
});

// Helper: create a caller with a given session
const makeCaller = (session: TestSession) =>
  t.createCallerFactory(testRouter)({ session, db: {} });

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('adminProcedure authorization', () => {
  it('allows ADMIN', async () => {
    const caller = makeCaller({ user: { id: '1', role: 'ADMIN', email: 'a@a.com' }, expires: '2099' });
    await expect(caller.adminOnly()).resolves.toBe('admin-ok');
  });

  it('throws FORBIDDEN for TRAINER', async () => {
    const caller = makeCaller({ user: { id: '2', role: 'TRAINER', email: 't@t.com' }, expires: '2099' });
    await expect(caller.adminOnly()).rejects.toThrow(TRPCError);
    await expect(caller.adminOnly()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws FORBIDDEN for CLIENT', async () => {
    const caller = makeCaller({ user: { id: '3', role: 'CLIENT', email: 'c@c.com' }, expires: '2099' });
    await expect(caller.adminOnly()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws UNAUTHORIZED when unauthenticated', async () => {
    const caller = makeCaller(null);
    await expect(caller.adminOnly()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('trainerProcedure authorization', () => {
  it('allows ADMIN', async () => {
    const caller = makeCaller({ user: { id: '1', role: 'ADMIN', email: 'a@a.com' }, expires: '2099' });
    await expect(caller.trainerOnly()).resolves.toBe('trainer-ok');
  });

  it('allows TRAINER', async () => {
    const caller = makeCaller({ user: { id: '2', role: 'TRAINER', email: 't@t.com' }, expires: '2099' });
    await expect(caller.trainerOnly()).resolves.toBe('trainer-ok');
  });

  it('throws FORBIDDEN for CLIENT', async () => {
    const caller = makeCaller({ user: { id: '3', role: 'CLIENT', email: 'c@c.com' }, expires: '2099' });
    await expect(caller.trainerOnly()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('clientProcedure authorization', () => {
  it('allows ADMIN, TRAINER, and CLIENT', async () => {
    for (const role of ['ADMIN', 'TRAINER', 'CLIENT'] as UserRole[]) {
      const caller = makeCaller({ user: { id: '1', role, email: 'x@x.com' }, expires: '2099' });
      await expect(caller.clientOnly()).resolves.toBe('client-ok');
    }
  });

  it('throws UNAUTHORIZED when unauthenticated', async () => {
    const caller = makeCaller(null);
    await expect(caller.clientOnly()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
