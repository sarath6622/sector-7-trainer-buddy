import 'server-only';
import { db } from '@/lib/db';

export class FcmService {
  static async sendToUser(
    userId: string,
    payload: { title: string; body: string; data?: Record<string, unknown> },
  ) {
    const tokens = await db.fcmToken.findMany({
      where: { userId },
      select: { token: true },
    });

    if (tokens.length === 0) return;

    const sendPromises = tokens.map((t: { token: string }) =>
      this.sendToToken(t.token, payload).catch(async () => {
        // If token is invalid, clean it up
        await db.fcmToken.delete({ where: { token: t.token } }).catch(() => {});
      }),
    );

    await Promise.allSettled(sendPromises);
  }

  static async sendToToken(
    token: string,
    payload: { title: string; body: string; data?: Record<string, unknown> },
  ) {
    if (!process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
      console.warn('[FCM] Service account credentials not configured — skipping push');
      return;
    }

    const { getMessaging } = await import('firebase-admin/messaging');
    const { firebaseAdminApp } = await import('@/lib/firebase-admin');

    // Send as a data-only message so the browser never auto-displays a notification.
    // The service worker's onBackgroundMessage handler reads these fields and calls
    // showNotification() itself, giving us exactly one notification per push.
    // FCM data values must all be strings.
    const data: Record<string, string> = {
      title: payload.title,
      body: payload.body,
      ...(payload.data
        ? Object.fromEntries(
            Object.entries(payload.data).map(([k, v]) => [k, String(v)]),
          )
        : {}),
    };

    await getMessaging(firebaseAdminApp).send({
      token,
      webpush: { fcmOptions: { link: '/' } },
      data,
    });
  }

  static async registerToken(userId: string, token: string, device?: string) {
    return db.fcmToken.upsert({
      where: { token },
      update: { userId, device, updatedAt: new Date() },
      create: { userId, token, device },
    });
  }
}
