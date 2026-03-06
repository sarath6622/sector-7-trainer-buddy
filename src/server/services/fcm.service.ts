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

    // FCM data values must all be strings
    const stringData = payload.data
      ? Object.fromEntries(
          Object.entries(payload.data).map(([k, v]) => [k, String(v)]),
        )
      : undefined;

    await getMessaging(firebaseAdminApp).send({
      token,
      notification: { title: payload.title, body: payload.body },
      webpush: {
        notification: {
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-96x96.png',
        },
        fcmOptions: { link: '/' },
      },
      data: stringData,
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
