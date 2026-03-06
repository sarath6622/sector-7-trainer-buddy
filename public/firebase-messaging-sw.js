/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// NEXT_PUBLIC_ vars are intentionally public — safe to embed in this static file.
// Registered at scope /fcm/ to avoid conflicting with the PWA Workbox SW at /.
firebase.initializeApp({
  apiKey: 'AIzaSyB-rWC6abX1r2lzkhSK-UK6dRdxzkvj7Ew',
  authDomain: 'sector7-fb0ff.firebaseapp.com',
  projectId: 'sector7-fb0ff',
  messagingSenderId: '184622370860',
  appId: '1:184622370860:web:a17a7407a89f06e5b90189',
});

// Force the new SW version to activate immediately without waiting for all
// tabs to close, so updated notification formatting takes effect right away.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const messaging = firebase.messaging();

// Background push — app closed or backgrounded.
// Messages are sent as data-only (no notification field) so the browser never
// auto-displays anything. We read title/body from payload.data and call
// showNotification exactly once ourselves.
messaging.onBackgroundMessage((payload) => {
  const { title, body, type } = payload.data ?? {};

  // Per-type display config: emoji prefix on the title and a descriptive subtitle
  // so the user can tell at a glance what kind of notification it is.
  const config = {
    TRAINER_MESSAGE: {
      prefix: '💬 ',
      subtitle: 'New message',
      tag: 'message',
    },
    PROGRAM_ASSIGNED: {
      prefix: '🏋️ ',
      subtitle: 'Workout update',
      tag: 'workout',
    },
    ACHIEVEMENT: {
      prefix: '🏆 ',
      subtitle: 'Achievement unlocked',
      tag: 'achievement',
    },
    SYSTEM_ANNOUNCEMENT: {
      prefix: '📢 ',
      subtitle: 'Announcement',
      tag: 'announcement',
    },
  }[type] ?? { prefix: '', subtitle: 'Sector 7', tag: 'default' };

  // For message notifications the title IS the sender name — make that clear.
  // For everything else, keep the title as-is but add the emoji prefix.
  const notifTitle = type === 'TRAINER_MESSAGE'
    ? `${config.prefix}${title ?? 'New message'}`
    : `${config.prefix}${title ?? 'Sector 7'}`;

  // Body already contains the relevant preview (message text, workout name, etc.)
  // Prepend a short category label when the body might otherwise feel bare.
  const notifBody = body
    ? (type === 'TRAINER_MESSAGE' ? body : `${config.subtitle}: ${body}`)
    : config.subtitle;

  self.registration.showNotification(notifTitle, {
    body: notifBody,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    tag: config.tag,       // same-type notifications replace each other
    renotify: true,        // still vibrate/sound even when replacing
    data: payload.data,
  });
});

// Tap notification → focus or open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    }),
  );
});
