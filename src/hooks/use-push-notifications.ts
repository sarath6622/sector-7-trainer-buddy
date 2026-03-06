'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

// ── Shared token-registration logic ──────────────────────────────────────────
// iOS 16.4+ requires Notification.requestPermission() from a direct user tap.
// This function is called either automatically (Android/Chrome) or via a button.

export async function doRegisterPushToken() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

  const { getFirebaseMessaging } = await import('@/lib/firebase');
  const messaging = await getFirebaseMessaging();
  if (!messaging) return;

  const swReg = await navigator.serviceWorker
    .register('/firebase-messaging-sw.js', { scope: '/fcm/' })
    .catch(() => null);
  if (!swReg) return;

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

  const ua = navigator.userAgent;
  const device =
    /iphone|ipod/i.test(ua) ||
    (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) ||
    /ipad/i.test(ua)
      ? 'ios'
      : /android/i.test(ua)
        ? 'android'
        : 'web';

  await fetch('/api/v1/notifications/register-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, device }),
  }).catch(() => {});
}

export function isIOSDevice() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return (
    /iphone|ipod/i.test(ua) ||
    /ipad/i.test(ua) ||
    (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
  );
}

export const PUSH_BANNER_DISMISSED_KEY = 'push-banner-dismissed';

// ── Hook ─────────────────────────────────────────────────────────────────────

export function usePushNotifications() {
  const { status } = useSession();
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated') return;
    if (!('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      doRegisterPushToken().catch(() => {});
      return;
    }
    if (Notification.permission !== 'default') return;
    if (sessionStorage.getItem(PUSH_BANNER_DISMISSED_KEY)) return;

    if (isIOSDevice()) {
      // iOS needs a user gesture — show a banner instead of auto-requesting
      const t = setTimeout(() => setShowBanner(true), 3000);
      return () => clearTimeout(t);
    } else {
      // Android / Chrome / desktop — auto-request after settling
      const t = setTimeout(() => {
        doRegisterPushToken().catch(() => {});
      }, 4000);
      return () => clearTimeout(t);
    }
  }, [status]);

  const enable = async () => {
    setShowBanner(false);
    await doRegisterPushToken().catch(() => {});
  };

  const dismiss = () => {
    setShowBanner(false);
    sessionStorage.setItem(PUSH_BANNER_DISMISSED_KEY, '1');
  };

  return { showBanner, enable, dismiss };
}
