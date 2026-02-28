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

## 7. Trainer Assigns Workout

```
Trainer submits AssignWorkoutForm:
  trpc.workout.assign.mutate({ clientId, title, exercises, ... })
    → trainerProcedure: verifies TRAINER or ADMIN role
    → WorkoutService.canTrainerAccessClient(trainerUserId, clientId)
        → db.trainerClientMapping.findFirst({ isActive: true })
        → throws FORBIDDEN if no active mapping
    → db.workoutLog.create({ status: 'ASSIGNED', assignedByTrainerId, ... })
        → nested create: WorkoutExercise + WorkoutSet rows
    → NotificationService.send({ type: 'PROGRAM_ASSIGNED', userId: client.userId })
        → 3-channel delivery: DB persist + Pusher + FCM
    → Return: WorkoutLog with exercises
```

---

## 8. Client Completes Workout

```
Client submits WorkoutLogger (assigned):
  trpc.workout.complete.mutate({ id, exercises, durationMin })
    → clientProcedure: verifies authenticated
    → db.clientProfile.findUnique → verify ownership (workoutLog.clientId === profile.id)
    → Guard: throws BAD_REQUEST if status is already COMPLETED or SKIPPED
    → db.$transaction:
        → workoutSet.deleteMany (old target sets)
        → workoutExercise.deleteMany (old target exercises)
        → workoutLog.update({ status: 'COMPLETED', date: now, exercises: create })
    → WorkoutService.calculateStreak(clientProfileId)
        → if streak hits 7 or 30: NotificationService.send({ type: 'ACHIEVEMENT' })
    → Return: updated WorkoutLog

Client submits WorkoutLogger (self-log):
  trpc.workout.log.mutate({ title, exercises, durationMin })
    → clientProcedure
    → db.workoutLog.create({ status: 'COMPLETED', assignedByTrainerId: null })
    → streak check → optional ACHIEVEMENT notification
    → Return: WorkoutLog
```

---

## 9. Admin Creates a User Account

```
Admin submits CreateUserDialog (name, email, password, role):
  trpc.user.create.mutate({ name, email, password, role })
    → adminProcedure: ADMIN only
    → db.user.findUnique({ email }) — throws CONFLICT if duplicate
    → bcrypt.hash(password, 12)
    → db.user.create({ role, passwordHash, status: 'ACTIVE' })
        → nested create: trainerProfile: {} OR clientProfile: {}
          (one atomic DB call — profile stub exists immediately)
    → User can now log in with provided credentials
    → Admin Users page refetches user.list
```

---

## 10. Admin Assigns a Trainer to a Client

```
Admin submits AssignClientDialog (trainerId, clientId, type):
  trpc.trainer.assignClient.mutate({ trainerId, clientId, type })
    → adminProcedure: ADMIN only
    → Guard: db.trainerClientMapping.findFirst({ trainerId, clientId, isActive: true })
        → throws CONFLICT if duplicate active mapping found
    → db.trainerClientMapping.create({ trainerId, clientId, type, isPrimary, isActive: true })
        → include: client.user, trainer.user (for notification payload)
    → NotificationService.send({ userId: client.user.id, type: 'PROGRAM_ASSIGNED' })
        — fire-and-forget (.catch logged) so Pusher failure never kills the mutation
    → Return: { id, trainerId, clientId, type, isActive }
    → Admin Trainers page refetches trainer.getMappings + trainer.listAll
```

---

## 11. Client Views Their Assigned Trainer

```
Client visits /client/profile:
  trpc.profile.getMyTrainer.useQuery()
    → clientProcedure
    → db.clientProfile.findUnique({ userId }) — returns null if no profile
    → db.trainerClientMapping.findFirst({
        clientId: profile.id,
        isActive: true,
        type: 'PRIMARY'
      })
      — returns null if no active primary mapping
    → If mapping found: return trainer card { name, image, bio, experience, specialties }
    → Rendered as "Your Trainer" card at top of /client/profile page
```

---

## 12. Trainer Completes Profile

```
Trainer submits /trainer/profile form:
  trpc.trainer.updateProfile.mutate({ bio, specialties, certifications, experience })
    → trainerProcedure: TRAINER or ADMIN
    → db.trainerProfile.upsert({
        where: { userId },
        create: { userId, bio, specialties, certifications, experience, profileCompleted: true },
        update: { bio, specialties, certifications, experience, profileCompleted: true }
      })
    → profileCompleted flag flips to true — Admin Users page Profile column shows "Complete"
```

