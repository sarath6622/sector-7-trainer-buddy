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
    // TODO: Implement with firebase-admin SDK for production
    // This requires firebase-admin package and service account credentials
    console.log(`[FCM] Would send to token ${token.slice(0, 10)}...`, payload);
  }

  static async registerToken(userId: string, token: string, device?: string) {
    return db.fcmToken.upsert({
      where: { token },
      update: { userId, device, updatedAt: new Date() },
      create: { userId, token, device },
    });
  }
}
