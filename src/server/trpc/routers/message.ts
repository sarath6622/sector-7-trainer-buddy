import 'server-only';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, trainerProcedure } from '../init';
import { NotificationService } from '@/server/services/notification.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

// Verifies the caller is a participant in the conversation; returns userId of the other party.
// Used by getThread, send, and markRead to enforce conversation-level access control.
async function assertParticipant(
  db: Parameters<Parameters<typeof protectedProcedure.query>[0]>[0]['ctx']['db'],
  conversationId: string,
  callerId: string,
) {
  const convo = await db.conversation.findUnique({
    where: { id: conversationId },
    include: {
      trainer: { select: { userId: true } },
      client:  { select: { userId: true } },
    },
  });
  if (!convo) throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
  const isTrainer = convo.trainer.userId === callerId;
  const isClient  = convo.client.userId  === callerId;
  if (!isTrainer && !isClient) throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a participant' });
  return {
    convo,
    receiverId: isTrainer ? convo.client.userId : convo.trainer.userId,
  };
}

// ── Router ────────────────────────────────────────────────────────────────────

export const messageRouter = router({
  // Trainers initiate all conversations; creates the thread if it doesn't exist yet.
  // Only available to trainers — clients cannot open new conversations.
  getOrCreateConversation: trainerProcedure
    .input(z.object({ clientProfileId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const trainerProfile = await ctx.db.trainerProfile.findUnique({
        where: { userId: ctx.session.user.id },
      });
      if (!trainerProfile) throw new TRPCError({ code: 'NOT_FOUND', message: 'Trainer profile not found' });

      // Enforce that only actively-mapped clients can be messaged
      const mapping = await ctx.db.trainerClientMapping.findFirst({
        where: { trainerId: trainerProfile.id, clientId: input.clientProfileId, isActive: true },
      });
      if (!mapping) throw new TRPCError({ code: 'FORBIDDEN', message: 'Client is not assigned to you' });

      return ctx.db.conversation.upsert({
        where: { trainerId_clientId: { trainerId: trainerProfile.id, clientId: input.clientProfileId } },
        create: { trainerId: trainerProfile.id, clientId: input.clientProfileId },
        update: {},
        include: { client: { include: { user: { select: { name: true, image: true } } } } },
      });
    }),

  // Returns all threads for the caller: trainer sees their client threads, client sees trainer threads.
  // Includes last message preview and per-conversation unread count for the inbox list.
  listConversations: protectedProcedure.query(async ({ ctx }) => {
    const me = ctx.session.user.id;
    const role = ctx.session.user.role;

    if (role === 'TRAINER' || role === 'ADMIN') {
      const trainerProfile = await ctx.db.trainerProfile.findUnique({ where: { userId: me } });
      if (!trainerProfile) return [];
      return ctx.db.conversation.findMany({
        where: { trainerId: trainerProfile.id },
        include: {
          client: { include: { user: { select: { name: true, image: true } } } },
          messages: { take: 1, orderBy: { createdAt: 'desc' } },
          _count: { select: { messages: { where: { receiverId: me, isRead: false } } } },
        },
        orderBy: { lastMessageAt: 'desc' },
      });
    } else {
      const clientProfile = await ctx.db.clientProfile.findUnique({ where: { userId: me } });
      if (!clientProfile) return [];
      return ctx.db.conversation.findMany({
        where: { clientId: clientProfile.id },
        include: {
          trainer: { include: { user: { select: { name: true, image: true } } } },
          messages: { take: 1, orderBy: { createdAt: 'desc' } },
          _count: { select: { messages: { where: { receiverId: me, isRead: false } } } },
        },
        orderBy: { lastMessageAt: 'desc' },
      });
    }
  }),

  // Cursor-paginated message history for a conversation; returns newest-first so the client
  // can reverse the array and load-more upward without re-indexing existing items.
  getThread: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        limit: z.number().min(1).max(50).default(30),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertParticipant(ctx.db, input.conversationId, ctx.session.user.id);

      const items = await ctx.db.message.findMany({
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        where: { conversationId: input.conversationId },
        orderBy: { createdAt: 'desc' },
        include: { sender: { select: { name: true, image: true } } },
      });

      let nextCursor: string | undefined;
      if (items.length > input.limit) nextCursor = items.pop()!.id;

      return { messages: items, nextCursor };
    }),

  // Creates a message in a conversation and notifies the receiver via triple-channel delivery.
  send: protectedProcedure
    .input(z.object({ conversationId: z.string(), body: z.string().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const me = ctx.session.user.id;
      const { receiverId } = await assertParticipant(ctx.db, input.conversationId, me);

      const [message] = await Promise.all([
        ctx.db.message.create({
          data: {
            conversationId: input.conversationId,
            senderId: me,
            receiverId,
            body: input.body,
          },
          include: { sender: { select: { name: true, image: true } } },
        }),
        // Update lastMessageAt so listConversations sorts by recent activity
        ctx.db.conversation.update({
          where: { id: input.conversationId },
          data: { lastMessageAt: new Date() },
        }),
      ]);

      // Triple-channel delivery: DB notification + Pusher real-time + FCM push — fire-and-forget
      ctx.db.user
        .findUnique({ where: { id: me }, select: { name: true } })
        .then((sender) =>
          NotificationService.send({
            userId: receiverId,
            type: 'TRAINER_MESSAGE',
            title: sender?.name ?? 'New message',
            message: input.body.slice(0, 100),
            data: { conversationId: input.conversationId },
          }),
        )
        .catch((err) => console.error('[message] notification failed:', err));

      return message;
    }),

  // Marks all unread messages from the other party as read when the user opens a thread.
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

  // Total unread message count across all conversations — used for nav badge.
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.message.count({
      where: { receiverId: ctx.session.user.id, isRead: false },
    });
  }),
});
