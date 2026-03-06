'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';

// Registers the Firebase messaging service worker at /fcm/ scope (separate from
// the PWA Workbox SW at / so they don't conflict), requests notification permission
// after the user has settled into the dashboard, then POSTs the FCM token to the
// backend so the server can deliver push notifications to this device.

async function registerPushToken() {
  try {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

    const { getFirebaseMessaging } = await import('@/lib/firebase');
    const messaging = await getFirebaseMessaging();
    // getFirebaseMessaging returns null when the browser doesn't support FCM
    // (e.g. iOS Safari < 16.4, or non-standalone iOS)
    if (!messaging) return;

    // Register the Firebase SW at /fcm/ scope to avoid taking over / from the
    // Workbox SW that next-pwa generates.
    const swReg = await navigator.serviceWorker
      .register('/firebase-messaging-sw.js', { scope: '/fcm/' })
      .catch(() => null);
    if (!swReg) return;

    // Request permission only if not yet decided
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') return;

    const { getToken } = await import('firebase/messaging');
    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: swReg,
    }).catch(() => null);
    if (!token) return;

    const device =
      /iphone|ipod/i.test(navigator.userAgent) ||
      (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1) ||
      /ipad/i.test(navigator.userAgent)
        ? 'ios'
        : /android/i.test(navigator.userAgent)
          ? 'android'
          : 'web';

    await fetch('/api/v1/notifications/register-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, device }),
    }).catch(() => {});
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[Push]', err);
    }
  }
}

export function usePushNotifications() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== 'authenticated') return;

    if (Notification.permission === 'granted') {
      // Already granted — register silently
      registerPushToken();
    } else if (Notification.permission === 'default') {
      // Give the user 4 s to settle before showing the browser permission dialog
      const t = setTimeout(registerPushToken, 4000);
      return () => clearTimeout(t);
    }
    // 'denied' → do nothing
  }, [status]);
}

// Mountable component — mirrors the OfflineSyncMounter pattern
export function PushNotificationMounter() {
  usePushNotifications();
  return null;
}
