# API Contracts

> AI reference — add a new entry for every tRPC procedure or REST endpoint you create.
> Include: procedure name, auth level, input schema, output shape.

---

## tRPC Routers

Base URL: `/api/trpc/{router}.{procedure}`
Serialization: superjson

### Procedure Auth Levels

| Procedure builder | Who can call |
|------------------|-------------|
| `publicProcedure` | Anyone (unauthenticated) |
| `protectedProcedure` | Any logged-in user |
| `adminProcedure` | ADMIN only |
| `trainerProcedure` | ADMIN + TRAINER |
| `clientProcedure` | ADMIN + TRAINER + CLIENT |

---

### `auth` router

| Procedure | Type | Auth | Input | Output |
|-----------|------|------|-------|--------|
| `auth.register` | mutation | public | `{ name, email, password, confirmPassword }` | `{ success: boolean, message: string }` |
| `auth.me` | query | protected | — | `User` object |

---

### `user` router

| Procedure | Type | Auth | Input | Output |
|-----------|------|------|-------|--------|
| `user.list` | query | admin | `{ page?, limit?, role? }` | `{ users: User[], total: number }` |
| `user.getById` | query | admin | `{ id: string }` | `User` |
| `user.updateStatus` | mutation | admin | `{ id: string, status: 'ACTIVE'\|'INACTIVE'\|'SUSPENDED' }` | `User` |
| `user.updateProfile` | mutation | protected | `{ name?, phone?, timezone?, language? }` | `User` |

---

### `exercise` router

| Procedure | Type | Auth | Input | Output |
|-----------|------|------|-------|--------|
| `exercise.list` | query | protected | `{ page?, limit?, search?, primaryMuscle?: MuscleGroup, category?: ExerciseCategory, difficulty?: DifficultyLevel, equipment?: Equipment }` | `{ exercises: Exercise[], total: number, page: number, totalPages: number }` |
| `exercise.getById` | query | protected | `{ id: string }` | `Exercise` (with `createdBy.name`) |
| `exercise.create` | mutation | admin | `{ name, description?, instructions?, primaryMuscle: MuscleGroup, secondaryMuscles?: MuscleGroup[], equipment?: Equipment, category: ExerciseCategory, difficulty?: DifficultyLevel, mediaUrl? }` | `Exercise` |
| `exercise.update` | mutation | admin | `{ id, name?, description?, instructions?, primaryMuscle?, secondaryMuscles?, equipment?, category?, difficulty?, mediaUrl? }` | `Exercise` — throws NOT_FOUND if id unknown |
| `exercise.delete` | mutation | admin | `{ id: string }` | `{ success: true }` — throws CONFLICT if exercise is used in any WorkoutExercise |

---

### `workout` router

| Procedure | Type | Auth | Input | Output |
|-----------|------|------|-------|--------|
| `workout.list` | query | `clientProcedure` | `{ clientId?, status?: WorkoutStatus, page?, limit? }` | `{ workouts: WorkoutLog[], total, page, totalPages }` — CLIENT sees only own logs; TRAINER sees only their mapped clients |
| `workout.getById` | query | `clientProcedure` | `{ id: string }` | `WorkoutLog` with full exercise + set detail — ownership-checked |
| `workout.assign` | mutation | `trainerProcedure` | `{ clientId, title, notes?, scheduledAt?, exercises: [...] }` | `WorkoutLog` with `status: ASSIGNED` — fires `PROGRAM_ASSIGNED` notification to client |
| `workout.log` | mutation | `clientProcedure` | `{ title?, notes?, durationMin?, exercises: [...] }` | `WorkoutLog` with `status: COMPLETED` (client self-log) |
| `workout.complete` | mutation | `clientProcedure` | `{ id, durationMin?, notes?, exercises: [...] }` | `WorkoutLog` — transitions `ASSIGNED → COMPLETED`; replaces set data atomically; fires `ACHIEVEMENT` on streak milestone |
| `workout.delete` | mutation | `trainerProcedure` | `{ id: string }` | `{ success: true }` — throws `CONFLICT` if status is `COMPLETED` |
| `workout.getStats` | query | `clientProcedure` | — | `{ streak, weeklyCount, totalWorkouts, lastWorkout }` |
| `workout.getTrainerOverview` | query | `trainerProcedure` | — | `{ clients: [{ clientProfileId, name, image, recentWorkouts }] }` |

---

### `notification` router

| Procedure | Type | Auth | Input | Output |
|-----------|------|------|-------|--------|
| `notification.list` | query | protected | `{ page?, limit?, unreadOnly? }` | `{ notifications: Notification[], total: number }` |
| `notification.markRead` | mutation | protected | `{ id: string }` | `Notification` |
| `notification.markAllRead` | mutation | protected | — | `{ count: number }` |

---

### `trainer` router

| Procedure | Type | Auth | Input | Output |
|-----------|------|------|-------|--------|
| `trainer.getClients` | query | trainerProcedure | — | `ClientProfile[]` |
| `trainer.getAvailability` | query | trainerProcedure | — | `TrainerAvailability[]` |
| `trainer.setAvailability` | mutation | trainerProcedure | `{ slots: { dayOfWeek, startTime, endTime }[] }` | `TrainerAvailability[]` |

---

### `habit` router

| Procedure | Type | Auth | Input | Output |
|-----------|------|------|-------|--------|
| `habit.list` | query | clientProcedure | — | `Habit[]` |
| `habit.create` | mutation | clientProcedure | `{ name, frequency, target }` | `Habit` |
| `habit.logCompletion` | mutation | clientProcedure | `{ habitId: string }` | `Habit` |

---

### `challenge` router

| Procedure | Type | Auth | Input | Output |
|-----------|------|------|-------|--------|
| `challenge.list` | query | protected | `{ active?: boolean }` | `Challenge[]` |
| `challenge.join` | mutation | clientProcedure | `{ challengeId: string }` | `ChallengeParticipant` |
| `challenge.create` | mutation | trainerProcedure | `{ name, description, startDate, endDate, goal }` | `Challenge` |

---

## REST Endpoints

### `POST /api/pusher/auth`

Authorizes a Pusher private channel subscription.

**Auth**: Session cookie required

**Request body**:
```json
{ "socket_id": "...", "channel_name": "private-user-{userId}" }
```

**Response**: Pusher auth signature object

**Guards**: Verifies that the `userId` in the channel name matches `session.user.id`

---

### `POST /api/v1/notifications/register-token`

Registers a device FCM token for the current user.

**Auth**: Session cookie required

**Request body**:
```json
{ "token": "fcm-device-token", "device": "web" }
```

**Response**:
```json
{ "success": true }
```

---

### `GET/POST /api/auth/[...nextauth]`

NextAuth.js handler — manages sessions, OAuth callbacks, credential sign-in.
Do not modify directly; configure via `src/lib/auth.ts`.
