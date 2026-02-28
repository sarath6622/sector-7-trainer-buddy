import { db } from '@/lib/db';
import { pusherServer } from '@/lib/pusher';
import { FcmService } from './fcm.service';
import type { NotificationType } from '@/generated/prisma/enums';

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

export class NotificationService {
  static async send(params: CreateNotificationParams) {
    const { userId, type, title, message, data } = params;

    // 1. Persist to database
    const notification = await db.notification.create({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { userId, type, title, message, data: (data ?? {}) as any },
    });

    // 2. Send real-time via Pusher
    await pusherServer.trigger(`private-user-${userId}`, 'new-notification', {
      id: notification.id,
      type,
      title,
      message,
      data,
      createdAt: notification.createdAt.toISOString(),
    });

    // 3. Send push notification via FCM (non-blocking)
    FcmService.sendToUser(userId, { title, body: message, data }).catch((err) =>
      console.error('FCM send failed:', err),
    );

    return notification;
  }

  static async sendBulk(
    userIds: string[],
    params: Omit<CreateNotificationParams, 'userId'>,
  ) {
    const notifications = await Promise.all(
      userIds.map((userId) => this.send({ ...params, userId })),
    );
    return notifications;
  }
}
