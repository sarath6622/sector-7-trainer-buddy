import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { z } from 'zod';
import type { UserRole } from '@/generated/prisma/enums';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/server/services/notification.service', () => ({
  NotificationService: { send: vi.fn().mockResolvedValue(undefined) },
}));

import { NotificationService } from '@/server/services/notification.service';

// ── Mock Prisma ───────────────────────────────────────────────────────────────

const mockConversation = {
  id: 'conv-1',
  trainerId: 'tp-1',
  clientId: 'cp-1',
  lastMessageAt: null,
  createdAt: new Date('2024-01-10'),
  trainer: { userId: 'user-trainer' },
  client:  { userId: 'user-client' },
};

const mockMessage = {
  id: 'msg-1',
  conversationId: 'conv-1',
  senderId: 'user-trainer',
  receiverId: 'user-client',
  body: 'Hello!',
  isRead: false,
  readAt: null,
  createdAt: new Date('2024-01-10T10:00:00'),
  sender: { name: 'Trainer Joe', image: null },
};

const mockDb = {
  trainerProfile: { findUnique: vi.fn() },
  clientProfile:  { findUnique: vi.fn() },
  trainerClientMapping: { findFirst: vi.fn() },
  conversation: {
    findUnique: vi.fn(),
    findMany:   vi.fn(),
    upsert:     vi.fn(),
    update:     vi.fn(),
  },
  message: {
    findMany:    vi.fn(),
    create:      vi.fn(),
    updateMany:  vi.fn(),
    count:       vi.fn(),
  },
  user: { findUnique: vi.fn() },
};

// ── Test tRPC ─────────────────────────────────────────────────────────────────

type TestContext = {
  session: { user: { id: string; role: UserRole; email: string }; expires: string } | null;
  db: typeof mockDb;
};

const t = initTRPC.context<TestContext>().create({ transformer: superjson });

const hasRole = (roles: UserRole[]) =>
  t.middleware(({ ctx, next }) => {
    if (!ctx.session?.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
    if (!roles.includes(ctx.session.user.role)) throw new TRPCError({ code: 'FORBIDDEN' });
    return next({ ctx: { session: ctx.session, db: ctx.db } });
  });

const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { session: ctx.session, db: ctx.db } });
});
const trainerProcedure = t.procedure.use(hasRole(['TRAINER', 'ADMIN']));

// Inline assertParticipant helper (mirrors message.ts)
async function assertParticipant(db: typeof mockDb, conversationId: string, callerId: string) {
  const convo = await db.conversation.findUnique({ where: { id: conversationId } });
  if (!convo) throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
  const c = convo as typeof mockConversation;
  const isTrainer = c.trainer.userId === callerId;
  const isClient  = c.client.userId  === callerId;
  if (!isTrainer && !isClient) throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a participant' });
  return { convo: c, receiverId: isTrainer ? c.client.userId : c.trainer.userId };
}

const testRouter = t.router({
  getOrCreateConversation: trainerProcedure
    .input(z.object({ clientProfileId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const tp = await ctx.db.trainerProfile.findUnique({ where: { userId: ctx.session.user.id } });
      if (!tp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Trainer profile not found' });
      const mapping = await ctx.db.trainerClientMapping.findFirst({
        where: { trainerId: (tp as any).id, clientId: input.clientProfileId, isActive: true },
      });
      if (!mapping) throw new TRPCError({ code: 'FORBIDDEN', message: 'Client is not assigned to you' });
      return ctx.db.conversation.upsert({
        where: { trainerId_clientId: { trainerId: (tp as any).id, clientId: input.clientProfileId } },
        create: { trainerId: (tp as any).id, clientId: input.clientProfileId },
        update: {},
      });
    }),

  listConversations: protectedProcedure.query(async ({ ctx }) => {
    const me = ctx.session.user.id;
    const role = ctx.session.user.role;
    if (role === 'TRAINER' || role === 'ADMIN') {
      const tp = await ctx.db.trainerProfile.findUnique({ where: { userId: me } });
      if (!tp) return [];
      return ctx.db.conversation.findMany({ where: { trainerId: (tp as any).id } });
    } else {
      const cp = await ctx.db.clientProfile.findUnique({ where: { userId: me } });
      if (!cp) return [];
      return ctx.db.conversation.findMany({ where: { clientId: (cp as any).id } });
    }
  }),

  getThread: protectedProcedure
    .input(z.object({ conversationId: z.string(), limit: z.number().default(30), cursor: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      await assertParticipant(ctx.db, input.conversationId, ctx.session.user.id);
      const items = await ctx.db.message.findMany({
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        where: { conversationId: input.conversationId },
        orderBy: { createdAt: 'desc' },
      });
      let nextCursor: string | undefined;
      if (items.length > input.limit) nextCursor = (items as typeof mockMessage[]).pop()!.id;
      return { messages: items, nextCursor };
    }),

  send: protectedProcedure
    .input(z.object({ conversationId: z.string(), body: z.string().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const me = ctx.session.user.id;
      const { receiverId } = await assertParticipant(ctx.db, input.conversationId, me);
      const [message] = await Promise.all([
        ctx.db.message.create({ data: { conversationId: input.conversationId, senderId: me, receiverId, body: input.body } }),
        ctx.db.conversation.update({ where: { id: input.conversationId }, data: { lastMessageAt: new Date() } }),
      ]);
      ctx.db.user.findUnique({ where: { id: me }, select: { name: true } })
        .then((sender: any) => NotificationService.send({
          userId: receiverId, type: 'TRAINER_MESSAGE',
          title: sender?.name ?? 'New message', message: input.body.slice(0, 100),
          data: { conversationId: input.conversationId },
        }))
        .catch(() => {});
      return message;
    }),

  markRead: protectedProcedure
    .input(z.object({ conversationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const me = ctx.session.user.id;
      await assertParticipant(ctx.db, input.conversationId, me);
      const result = await ctx.db.message.updateMany({
        where: { conversationId: input.conversationId, receiverId: me, isRead: false },
        data: { isRead: true, readAt: new Date() },
      });
      return { count: result.count };
    }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.message.count({ where: { receiverId: ctx.session.user.id, isRead: false } });
  }),
});

const makeCtx = (role: UserRole | null, userId = 'user-trainer'): TestContext => ({
  session: role ? { user: { id: userId, role, email: `${userId}@gym.com` }, expires: '2099' } : null,
  db: mockDb,
});
const makeCaller = (role: UserRole | null, userId?: string) =>
  t.createCallerFactory(testRouter)(makeCtx(role, userId));

beforeEach(() => {
  vi.clearAllMocks();
  // Default: conversation found, caller is trainer participant
  mockDb.conversation.findUnique.mockResolvedValue(mockConversation);
});

// ── getOrCreateConversation ───────────────────────────────────────────────────

describe('message.getOrCreateConversation', () => {
  it('upserts and returns conversation for a trainer with active mapping', async () => {
    mockDb.trainerProfile.findUnique.mockResolvedValue({ id: 'tp-1' });
    mockDb.trainerClientMapping.findFirst.mockResolvedValue({ id: 'map-1' });
    mockDb.conversation.upsert.mockResolvedValue(mockConversation);

    const result = await makeCaller('TRAINER').getOrCreateConversation({ clientProfileId: 'cp-1' });
    expect(result.id).toBe('conv-1');
    expect(mockDb.conversation.upsert).toHaveBeenCalled();
  });

  it('throws FORBIDDEN when client is not actively mapped to the trainer', async () => {
    mockDb.trainerProfile.findUnique.mockResolvedValue({ id: 'tp-1' });
    mockDb.trainerClientMapping.findFirst.mockResolvedValue(null);

    await expect(makeCaller('TRAINER').getOrCreateConversation({ clientProfileId: 'cp-99' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws NOT_FOUND when trainer profile does not exist', async () => {
    mockDb.trainerProfile.findUnique.mockResolvedValue(null);

    await expect(makeCaller('TRAINER').getOrCreateConversation({ clientProfileId: 'cp-1' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws FORBIDDEN for CLIENT role', async () => {
    await expect(makeCaller('CLIENT').getOrCreateConversation({ clientProfileId: 'cp-1' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

// ── listConversations ─────────────────────────────────────────────────────────

describe('message.listConversations', () => {
  it('returns trainer conversations when caller is TRAINER', async () => {
    mockDb.trainerProfile.findUnique.mockResolvedValue({ id: 'tp-1' });
    mockDb.conversation.findMany.mockResolvedValue([mockConversation]);

    const result = await makeCaller('TRAINER').listConversations();
    expect(result).toHaveLength(1);
    expect(mockDb.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { trainerId: 'tp-1' } }),
    );
  });

  it('returns client conversations when caller is CLIENT', async () => {
    mockDb.clientProfile.findUnique.mockResolvedValue({ id: 'cp-1' });
    mockDb.conversation.findMany.mockResolvedValue([mockConversation]);

    const result = await makeCaller('CLIENT', 'user-client').listConversations();
    expect(result).toHaveLength(1);
    expect(mockDb.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: 'cp-1' } }),
    );
  });

  it('returns empty array when trainer has no profile', async () => {
    mockDb.trainerProfile.findUnique.mockResolvedValue(null);
    const result = await makeCaller('TRAINER').listConversations();
    expect(result).toHaveLength(0);
  });
});

// ── getThread ─────────────────────────────────────────────────────────────────

describe('message.getThread', () => {
  it('returns messages newest-first for a participant', async () => {
    mockDb.message.findMany.mockResolvedValue([mockMessage]);

    const result = await makeCaller('TRAINER').getThread({ conversationId: 'conv-1' });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].body).toBe('Hello!');
    expect(result.nextCursor).toBeUndefined();
  });

  it('sets nextCursor when more messages than limit', async () => {
    const msgs = [
      { ...mockMessage, id: 'msg-1' },
      { ...mockMessage, id: 'msg-2' },
    ];
    mockDb.message.findMany.mockResolvedValue(msgs);

    const result = await makeCaller('TRAINER').getThread({ conversationId: 'conv-1', limit: 1 });
    expect(result.messages).toHaveLength(1);
    expect(result.nextCursor).toBe('msg-2');
  });

  it('throws FORBIDDEN for a non-participant', async () => {
    mockDb.conversation.findUnique.mockResolvedValue(mockConversation);
    await expect(
      makeCaller('TRAINER', 'user-stranger').getThread({ conversationId: 'conv-1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws UNAUTHORIZED when unauthenticated', async () => {
    await expect(makeCaller(null).getThread({ conversationId: 'conv-1' }))
      .rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

// ── send ──────────────────────────────────────────────────────────────────────

describe('message.send', () => {
  it('creates a message and fires notification to the receiver', async () => {
    mockDb.message.create.mockResolvedValue(mockMessage);
    mockDb.conversation.update.mockResolvedValue({});
    mockDb.user.findUnique.mockResolvedValue({ name: 'Trainer Joe' });

    const result = await makeCaller('TRAINER').send({ conversationId: 'conv-1', body: 'Hello!' });
    expect(result.body).toBe('Hello!');
    expect(mockDb.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ senderId: 'user-trainer', receiverId: 'user-client', body: 'Hello!' }),
      }),
    );
    // Notification is fire-and-forget, let pending microtasks flush
    await Promise.resolve();
    expect(NotificationService.send).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-client', type: 'TRAINER_MESSAGE' }),
    );
  });

  it('throws FORBIDDEN for a non-participant', async () => {
    await expect(
      makeCaller('TRAINER', 'user-stranger').send({ conversationId: 'conv-1', body: 'Hi' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

// ── markRead ──────────────────────────────────────────────────────────────────

describe('message.markRead', () => {
  it('marks unread messages as read and returns count', async () => {
    mockDb.message.updateMany.mockResolvedValue({ count: 3 });

    const result = await makeCaller('TRAINER').markRead({ conversationId: 'conv-1' });
    expect(result.count).toBe(3);
    expect(mockDb.message.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ receiverId: 'user-trainer', isRead: false }),
        data: expect.objectContaining({ isRead: true }),
      }),
    );
  });

  it('returns count 0 when there are no unread messages', async () => {
    mockDb.message.updateMany.mockResolvedValue({ count: 0 });
    const result = await makeCaller('CLIENT', 'user-client').markRead({ conversationId: 'conv-1' });
    expect(result.count).toBe(0);
  });
});

// ── unreadCount ───────────────────────────────────────────────────────────────

describe('message.unreadCount', () => {
  it('returns the number of unread messages for the caller', async () => {
    mockDb.message.count.mockResolvedValue(5);
    const result = await makeCaller('CLIENT', 'user-client').unreadCount();
    expect(result).toBe(5);
    expect(mockDb.message.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: { receiverId: 'user-client', isRead: false } }),
    );
  });

  it('returns 0 when no unread messages', async () => {
    mockDb.message.count.mockResolvedValue(0);
    const result = await makeCaller('TRAINER').unreadCount();
    expect(result).toBe(0);
  });

  it('throws UNAUTHORIZED when unauthenticated', async () => {
    await expect(makeCaller(null).unreadCount()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
