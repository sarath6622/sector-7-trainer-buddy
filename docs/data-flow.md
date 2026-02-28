# Data Flow

> AI reference — update this file when a new data path is introduced through the system.

---

## 1. Authentication Flow

```
User submits login form
  → POST /api/auth/callback/credentials (NextAuth handler)
  → auth.ts: Credentials provider verify()
      → db.user.findUnique({ email })
      → bcrypt.compare(password, passwordHash)
  → On success: JWT token created with { id, role }
  → auth.config.ts jwt() callback: adds id + role to token
  → auth.config.ts session() callback: exposes id + role on session.user
  → proxy.ts authorized() callback: checks role vs requested route
  → Redirect to /{role} dashboard
```

---

## 2. tRPC Request Flow

```
Client component calls trpc.{router}.{procedure}.useQuery/useMutation()
  → TanStack Query issues HTTP POST to /api/trpc/{router}.{procedure}
  → Next.js route handler (src/app/api/trpc/[trpc]/route.ts)
  → createTRPCContext(): resolves session from NextAuth
  → Procedure middleware: isAuthed / hasRole(['ADMIN']) etc.
      → throws UNAUTHORIZED or FORBIDDEN if check fails
  → Procedure handler runs with guaranteed ctx.session.user
  → Prisma query via db singleton (src/lib/db.ts)
  → Response serialized via superjson → client
```

---

## 3. Notification Delivery Flow

```
Server-side trigger (e.g. trainer assigns workout):
  NotificationService.send({ userId, type, title, message, data })
    │
    ├── 1. db.notification.create()          — persists to DB
    │
    ├── 2. pusherServer.trigger(
    │         'private-user-{userId}',
    │         'new-notification', payload)   — real-time if app open
    │
    └── 3. FcmService.sendToUser(userId, payload)
              → db.fcmToken.findMany({ userId })
              → firebase-admin.messaging().send() per token
              → on invalid token: db.fcmToken.delete()  — self-healing

Client side:
  use-pusher.ts hook → subscribes to 'private-user-{userId}' channel
    → on 'new-notification': useNotificationStore.addNotification()
    → NotificationBell badge count increments
```

---

## 4. FCM Token Registration Flow

```
User opens app (browser/PWA):
  use-fcm.ts hook
    → Notification.requestPermission()
    → firebase.getToken({ vapidKey })
    → POST /api/v1/notifications/register-token { token, device }
    → FcmService.registerToken(userId, token, device)
    → db.fcmToken.upsert()   — one row per device per user
```

---

## 5. Pusher Channel Authorization Flow

```
pusher-js client attempts to subscribe to 'private-user-{userId}'
  → POST /api/pusher/auth { socket_id, channel_name }
  → Handler verifies session.user.id matches channel userId
  → pusherServer.authorizeChannel(socket_id, channel_name)
  → Returns auth signature to client
  → Subscription succeeds
```

---

## 6. Data Write Flow (typical mutation)

```
Client calls trpc.{router}.{action}.useMutation()
  → Optimistic update (optional) via TanStack Query
  → tRPC handler: validates input with Zod schema
  → Prisma mutation via db singleton
  → On success: return updated entity
  → Client: invalidate related queries → UI re-renders
```
