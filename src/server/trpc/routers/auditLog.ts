import 'server-only';
import { z } from 'zod';
import { router, adminProcedure } from '../init';

export const auditLogRouter = router({
  // Paginated audit log — filterable by actor, action prefix, entity, and date range
  list: adminProcedure
    .input(
      z.object({
        userId: z.string().nullish(),
        action: z.string().nullish(),      // prefix-match, e.g. "USER_" or "CHALLENGE_"
        entity: z.string().nullish(),
        dateFrom: z.string().nullish(),    // ISO date string
        dateTo: z.string().nullish(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(25),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { userId, action, entity, dateFrom, dateTo, page, limit } = input;

      const where = {
        ...(userId ? { userId } : {}),
        ...(action ? { action: { startsWith: action } } : {}),
        ...(entity ? { entity } : {}),
        ...(dateFrom || dateTo
          ? {
              createdAt: {
                ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
                ...(dateTo ? { lte: new Date(dateTo + 'T23:59:59.999Z') } : {}),
              },
            }
          : {}),
      };

      const [logs, total] = await Promise.all([
        ctx.db.auditLog.findMany({
          where,
          select: {
            id: true,
            action: true,
            entity: true,
            entityId: true,
            details: true,
            createdAt: true,
            user: { select: { id: true, name: true, email: true, image: true, role: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        ctx.db.auditLog.count({ where }),
      ]);

      return { logs, total, page, totalPages: Math.ceil(total / limit) };
    }),
});
