# Architecture

> AI reference — update this file when adding a new service, layer, or third-party integration.

## Overview

Sector 7 is a PWA fitness management platform with three user roles:
`ADMIN` | `TRAINER` | `CLIENT`

Built on Next.js App Router. All routes live under route groups that enforce role boundaries.

---

## Layer Map

```
Browser / Mobile PWA
  │
  ├── Next.js App Router (src/app/)
  │     ├── (auth)/          — /login, /register  [public]
  │     ├── (dashboard)/     — shared shell layout
  │     │     ├── admin/     — ADMIN only (dashboard, users, trainers, exercises, challenges)
  │     │     ├── trainer/   — TRAINER only (dashboard, clients, workouts, exercises, profile, schedule)
  │     │     └── client/    — CLIENT only (dashboard, workouts, exercises, habits, community, messages, profile)
  │     ├── api/
  │     │     ├── auth/[...nextauth]/  — NextAuth.js handler
  │     │     ├── pusher/auth/         — Pusher channel authorization
  │     │     ├── trpc/[trpc]/         — tRPC HTTP handler
  │     │     └── v1/                  — REST endpoints (FCM token reg.)
  │     └── manifest.ts      — dynamic PWA manifest
  │
  ├── tRPC Routers (src/server/trpc/)
  │     ├── init.ts           — context, procedure builders
  │     └── routers/          — auth, user, exercise, workout,
  │                              notification, trainer, profile,
  │                              habit, challenge, announcement,
  │                              achievement, message
  │
  ├── Service Layer (src/server/services/)
  │     ├── notification.service.ts  — triple-channel delivery
  │     ├── workout.service.ts       — streak, volume, access-control logic
  │     └── fcm.service.ts           — FCM token mgmt + push
  │
  ├── Data Layer
  │     ├── src/lib/db.ts     — Prisma singleton (adapter-pg)
  │     └── prisma/schema.prisma  — 23 models
  │
  ├── Client State (src/stores/)
  │     ├── use-notification-store.ts  — unread count + list
  │     ├── use-sidebar-store.ts       — sidebar open/closed
  │     └── use-offline-store.ts       — offline queue count + sync state
  │
  └── Offline Layer
        ├── src/lib/indexed-db.ts      — IDB schema + typed CRUD (pendingWorkouts, exerciseCache)
        └── src/hooks/use-offline-sync.ts — queue flush logic + OfflineSyncMounter
```


---

## Offline Mode Architecture

IndexedDB (via `idb`) is the client-side persistence layer for the offline mutation queue.

| Layer | File | Role |
|-------|------|------|
| IDB access | `src/lib/indexed-db.ts` | Schema, typed CRUD for `pendingWorkouts` + `exerciseCache` stores |
| Sync state | `src/stores/use-offline-store.ts` | Zustand: pendingCount, isSyncing, lastSyncAt |
| Sync logic | `src/hooks/use-offline-sync.ts` | Flushes IDB queue via raw tRPC client on reconnect; stop-on-first-error |
| UI | `src/components/shared/offline-banner.tsx` | Red/amber sticky banner in dashboard shell |
| Workbox | `next.config.ts` runtimeCaching | NetworkFirst cache for `exercise.list` API (24 h TTL) |

**Offline workout flow:** `WorkoutLogger.onSubmit` detects `!isOnline` → enqueues to IDB → `useOfflineSync` drains on reconnect via `trpcClient.workout.log.mutate` / `.complete.mutate`.

---

## Auth Architecture

NextAuth v5 beta — JWT strategy (no DB sessions).

| File | Purpose |
|------|---------|
| `src/lib/auth.config.ts` | Edge-compatible config — no Prisma. Handles route authorization, JWT/session callbacks |
| `src/lib/auth.ts` | Full server config — PrismaAdapter, bcrypt credential verification |
| `src/proxy.ts` | Next.js 16 route protection (replaces middleware.ts) |

Role → route mapping enforced in `auth.config.ts → authorized()`:
- `/admin/*` → ADMIN only
- `/trainer/*` → TRAINER only
- `/client/*` → CLIENT only

---

## Database (Prisma v7)

- Provider: PostgreSQL (Neon cloud)
- Prisma v7 requires driver adapter — no `url` in schema datasource
- Adapter: `@prisma/adapter-pg` via `PrismaPg({ connectionString })`
- Generated client: `src/generated/prisma/client.ts` and `enums.ts`
- Datasource URL configured in `prisma.config.ts` only

Key model groups:
- **Identity**: User, Account, Session, VerificationToken
- **Profiles**: TrainerProfile, ClientProfile
- **Mapping**: TrainerClientMapping, TrainerAvailability
- **Fitness**: Exercise, WorkoutLog, WorkoutExercise, WorkoutSet
- **Engagement**: Habit, Challenge, ChallengeParticipant, LeaderboardEntry
- **Ops**: Notification, FcmToken, AuditLog

### TrainerClientMapping design

- `isActive: boolean` — soft-delete pattern; deactivated mappings are archived, not deleted
- `type: 'PRIMARY' | 'TEMPORARY'` — only PRIMARY mappings appear in the client's "Your Trainer" card
- `isPrimary: boolean` — denormalized from `type` for direct query filtering
- Unique guard enforced in `trainer.assignClient` procedure (not DB constraint) to allow re-assignment after removal

### Profile Onboarding Pattern

Both `TrainerProfile.profileCompleted` and `ClientProfile.profileCompleted` default to `false`.  
They flip to `true` only when the user explicitly submits their profile form:
- Trainer: `trainer.updateProfile` → `/trainer/profile`
- Client: `profile.updateClient` → `/client/profile`

Admin Users page reads this flag for the "Profile" column (Pending → Complete).  
Profile stubs are auto-created when admin creates a user via `user.create` (or on first `getMyProfile`/`getMyClientProfile` query via upsert).



## Notification System (Triple-channel)

All three channels triggered via a single `NotificationService.send()` call:

1. **Persist** — `db.notification.create()` → queryable history
2. **Real-time** — `pusherServer.trigger('private-user-{id}', 'new-notification', ...)` → instant in-app
3. **Push** — `FcmService.sendToUser()` → background push when app not open

Client subscribes to Pusher channel in `use-pusher.ts` hook.
FCM token registered on first load via `use-fcm.ts` hook.

---

## PWA

- Service worker: `@ducanh2912/next-pwa` (webpack only — build uses `--webpack` flag)
- FCM background messages: `public/firebase-messaging-sw.js`
- Manifest: `src/app/manifest.ts` (Next.js metadata API)
- Dev uses Turbopack (`--turbopack`), build uses webpack (`--webpack`)

---

## Third-Party Services

| Service | Purpose | Config |
|---------|---------|--------|
| Neon | PostgreSQL hosting | `DATABASE_URL` |
| Pusher | Real-time WebSocket | `PUSHER_*` env vars |
| Firebase FCM | Push notifications | `NEXT_PUBLIC_FIREBASE_*` env vars |
| Vercel | Deployment | Auto-detected |
