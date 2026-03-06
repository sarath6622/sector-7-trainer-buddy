import 'server-only';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, adminProcedure, protectedProcedure } from '../init';
import { NotificationService } from '@/server/services/notification.service';
import { writeAudit } from '@/lib/audit';

export const announcementRouter = router({
  // Public feed — sorted pinned-first then newest-first; used by clients and trainers
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const items = await ctx.db.announcement.findMany({
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        include: { author: { select: { name: true, image: true } } },
      });

      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        nextCursor = items.pop()!.id;
      }

      return { announcements: items, nextCursor };
    }),

  // Admin management view — returns all announcements without pagination
  listAll: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.announcement.findMany({
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      include: { author: { select: { name: true, image: true } } },
    });
  }),

  // Admin creates a gym-wide announcement; broadcasts a notification to every active user
  create: adminProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        body: z.string().min(1),
        isPinned: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const announcement = await ctx.db.announcement.create({
        data: {
          title: input.title,
          body: input.body,
          isPinned: input.isPinned,
          createdBy: ctx.session.user.id,
        },
        include: { author: { select: { name: true, image: true } } },
      });

      // Broadcast to all active users — fire-and-forget so slow delivery never blocks the mutation
      ctx.db.user
        .findMany({ where: { status: 'ACTIVE' }, select: { id: true } })
        .then((users) => {
          const userIds = users.map((u) => u.id);
          return NotificationService.sendBulk(userIds, {
            type: 'SYSTEM_ANNOUNCEMENT',
            title: input.title,
            message: input.body,
            data: { announcementId: announcement.id },
          });
        })
        .catch((err) => console.error('[announcement] bulk notification failed:', err));

      writeAudit(ctx.db, ctx.session.user.id, 'ANNOUNCEMENT_CREATE', 'Announcement', announcement.id, { title: input.title });

      return announcement;
    }),

  // Pins an announcement to the top of the feed
  pin: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.announcement.findUnique({ where: { id: input.id } });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Announcement not found' });

      return ctx.db.announcement.update({
        where: { id: input.id },
        data: { isPinned: true },
        include: { author: { select: { name: true, image: true } } },
      });
    }),

  // Unpins an announcement
  unpin: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.announcement.findUnique({ where: { id: input.id } });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Announcement not found' });

      return ctx.db.announcement.update({
        where: { id: input.id },
        data: { isPinned: false },
        include: { author: { select: { name: true, image: true } } },
      });
    }),

  // Permanently deletes an announcement
  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.announcement.findUnique({ where: { id: input.id } });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Announcement not found' });

      await ctx.db.announcement.delete({ where: { id: input.id } });
      writeAudit(ctx.db, ctx.session.user.id, 'ANNOUNCEMENT_DELETE', 'Announcement', input.id);

      return { success: true };
    }),
});
