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

const messaging = firebase.messaging();

// Background push — app closed or backgrounded.
// Messages are sent as data-only (no notification field) so the browser never
// auto-displays anything. We read title/body from payload.data and call
// showNotification exactly once ourselves.
messaging.onBackgroundMessage((payload) => {
  const { title, body, type } = payload.data ?? {};
  self.registration.showNotification(title ?? 'Sector 7', {
    body: body ?? 'You have a new notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    tag: type ?? 'default',
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
