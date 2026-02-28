'use client';

import { useEffect, useCallback } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { getFirebaseMessaging } from '@/lib/firebase';
import { useSession } from 'next-auth/react';
import { useNotificationStore } from '@/stores/use-notification-store';

export function useFcm() {
  const { data: session } = useSession();
  const addNotification = useNotificationStore((s) => s.addNotification);

  const requestPermissionAndRegister = useCallback(async () => {
    if (!session?.user?.id) return;
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const messaging = await getFirebaseMessaging();
    if (!messaging) return;

    try {
      const token = await getToken(messaging, {
        vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      });

      if (token) {
        await fetch('/api/v1/notifications/register-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, device: navigator.userAgent }),
        });
      }
    } catch (err) {
      console.error('FCM token registration failed:', err);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    requestPermissionAndRegister();
  }, [requestPermissionAndRegister]);

  // Handle foreground messages
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    getFirebaseMessaging().then((messaging) => {
      if (!messaging) return;
      unsubscribe = onMessage(messaging, (payload) => {
        if (payload.notification) {
          addNotification({
            id: payload.messageId ?? crypto.randomUUID(),
            type: (payload.data?.type as string) ?? 'SYSTEM_ANNOUNCEMENT',
            title: payload.notification.title ?? 'Notification',
            message: payload.notification.body ?? '',
            isRead: false,
            createdAt: new Date().toISOString(),
          });
        }
      });
    });

    return () => unsubscribe?.();
  }, [addNotification]);

  return { requestPermissionAndRegister };
}
