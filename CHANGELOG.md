# Changelog

All notable changes to Sector 7 — Trainer Buddy are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

AI assistants: add entries under `[Unreleased]` for every modification per CLAUDE.md rules.

---

## [Unreleased]

### Fixed
- `user.list` returning 500 when `role` or `search` were unset — tRPC serializes unset React state as `null` but Zod `.optional()` only accepts `undefined`; changed both fields to `.nullish()` (`src/server/trpc/routers/user.ts`)
- `AssignClientDialog` was passing `User.id` as `clientId` to `trainer.assignClient` which expects `ClientProfile.id` — fixed to use `u.clientProfile?.id`; clients without a profile stub are now disabled in the list with a "No profile" label (`src/components/admin/assign-client-dialog.tsx`)
- `trainer.assignClient` returning 500 — `NotificationService.send` was `await`-ed directly after the mapping write; if Pusher or FCM threw (e.g. missing env var), the error propagated and killed the whole mutation even though the DB write succeeded. Changed to fire-and-forget `.catch()` so notification failures are logged but never surface as API errors (`src/server/trpc/routers/trainer.ts`)

### Added (Admin User Management)
- `user.create` `adminProcedure` — admin creates TRAINER or CLIENT accounts directly with role-appropriate profile stub auto-created on the same DB call; prevents duplicate emails (`src/server/trpc/routers/user.ts`)
- `user.updateStatus` `adminProcedure` — toggle user status between `ACTIVE`, `INACTIVE`, `SUSPENDED` (`src/server/trpc/routers/user.ts`)
- `user.deactivate` `adminProcedure` — soft-deactivate (sets `INACTIVE`); guards against self-deactivation (`src/server/trpc/routers/user.ts`)
- `CreateUserDialog` component — role toggle (TRAINER/CLIENT), name, email, temp password with show/hide; summary badge confirms what gets created (`src/components/admin/create-user-dialog.tsx`)
- Admin Users page (`/admin/users`) — searchable + role-filterable user table with status badges, profile-completion indicators, per-row dropdown (Activate / Suspend / Deactivate), dedicated **Add Trainer** and **Add Client** buttons, paginated (`src/app/(dashboard)/admin/users/page.tsx`)

### Changed (Admin User Management)
- `user.list` `adminProcedure` input extended with `search` field (case-insensitive name+email filter) and includes `trainerProfile.profileCompleted` / `clientProfile.profileCompleted` in the select for the UI badge (`src/server/trpc/routers/user.ts`)

### Added (Sprint 4 — Trainer-Client Mapping)
- `TrainerSpecialty` enum (10 values: `WEIGHT_LOSS`, `MUSCLE_GAIN`, `POWERLIFTING`, `CROSSFIT`, `YOGA`, `REHABILITATION`, `NUTRITION`, `CARDIO`, `FLEXIBILITY`, `SPORTS_PERFORMANCE`) — replaces free-text `String[]` on `TrainerProfile.specialties` for structured filtering (`prisma/schema.prisma`)
- `experience Int?` field to `TrainerProfile` — stores trainer's years of professional experience (`prisma/schema.prisma`)
- `profileCompleted Boolean @default(false)` on both `TrainerProfile` and `ClientProfile` — tracks onboarding completion state (`prisma/schema.prisma`)
- `trainer.getMyProfile` `trainerProcedure` — upsert-based query returning own profile for form pre-fill (`src/server/trpc/routers/trainer.ts`)
- `trainer.updateProfile` `trainerProcedure` — updates bio, specialties, certifications, experience; sets `profileCompleted: true` (`src/server/trpc/routers/trainer.ts`)
- `trainer.getClients` `trainerProcedure` — roster of active mapped clients with last workout stat (`src/server/trpc/routers/trainer.ts`)
- `trainer.getClientDetail` `trainerProcedure` — single client full profile + workout history, ownership-checked against mapping (`src/server/trpc/routers/trainer.ts`)
- `trainer.listAll` `adminProcedure` — all trainer profiles with active client counts for admin UI (`src/server/trpc/routers/trainer.ts`)
- `trainer.getMappings` `adminProcedure` — paginated active mappings table with trainer+client hydration (`src/server/trpc/routers/trainer.ts`)
- `trainer.assignClient` `adminProcedure` — creates mapping with duplicate guard + `PROGRAM_ASSIGNED` notification to client (`src/server/trpc/routers/trainer.ts`)
- `trainer.removeAssignment` `adminProcedure` — soft-deactivates mapping, sets `endDate`, preserves history (`src/server/trpc/routers/trainer.ts`)
- New `profile.ts` tRPC router registered as `profile` sub-router (`src/server/trpc/routers/profile.ts`, `src/server/trpc/router.ts`)
- `profile.getMyTrainer` `clientProcedure` — returns assigned primary trainer card (or null) (`src/server/trpc/routers/profile.ts`)
- `profile.updateClient` `clientProcedure` — upserts client profile (DOB, gender, height, weight, goals); sets `profileCompleted: true` (`src/server/trpc/routers/profile.ts`)
- `profile.getMyClientProfile` `clientProcedure` — upsert-based query for client profile form pre-fill (`src/server/trpc/routers/profile.ts`)
- `profile.getClientProfile` `trainerProcedure` — trainer views a client's profile, ownership-checked (`src/server/trpc/routers/profile.ts`)
- `ClientCard` component — client roster card with avatar, goals chips, last workout ago, and "Assign Workout" button (`src/components/trainer/client-card.tsx`)
- `ClientDetailSheet` component — slide-in panel: client stats, fitness goals, recent workout history (`src/components/trainer/client-detail-sheet.tsx`)
- `AssignClientDialog` component — admin dialog: trainer dropdown + searchable client list + mapping type + reason (`src/components/admin/assign-client-dialog.tsx`)
- `MappingTable` component — paginated active mappings table with deactivation via AlertDialog confirm (`src/components/admin/mapping-table.tsx`)
- Trainer Profile page — bio, experience, specialty toggle-chips, certification tag input; marks `profileCompleted` on save (`src/app/(dashboard)/trainer/profile/page.tsx`)
- Trainer Clients page — responsive grid of ClientCard; empty state with explanation; ClientDetailSheet on click (`src/app/(dashboard)/trainer/clients/page.tsx`)
- Client Profile page — assigned trainer card (specialties, bio, experience) + body metrics form + fitness goal toggle-chips (`src/app/(dashboard)/client/profile/page.tsx`)
- Admin Trainers page — trainer cards with client counts + profile completion badge; active mappings table; "Assign Client" CTA (`src/app/(dashboard)/admin/trainers/page.tsx`)
- `TRAINER_SPECIALTY_LABELS`, `FITNESS_GOAL_LABELS` display-label maps exported from constants (`src/lib/constants.ts`)
- `Trainers` added to ADMIN nav; `Profile` added to TRAINER and CLIENT nav (`src/lib/constants.ts`)
- 18 new unit tests: trainer router (10) and profile router (8) — all passing (`src/server/trpc/routers/__tests__/trainer.test.ts`, `src/server/trpc/routers/__tests__/profile.test.ts`)

### Changed (Sprint 4)
- `trainer.ts` router fully rewritten — replaced single-procedure stub with 8 production-grade procedures; old `assignClient` input interface preserved (`src/server/trpc/routers/trainer.ts`)
- `src/server/trpc/router.ts` — registered new `profileRouter` as `profile` namespace

### Added (Sprint 3 — Workout Logging)
- `WorkoutStatus` enum (`ASSIGNED | IN_PROGRESS | COMPLETED | SKIPPED`) + `status`, `assignedByTrainerId`, `scheduledAt` fields on `WorkoutLog` to distinguish trainer-assigned vs client self-logged workouts (`prisma/schema.prisma`)
- `WorkoutService` — pure business-logic class: `calculateStreak`, `getWeeklyCount`, `getTotalVolume`, `canTrainerAccessClient`, `getTotalWorkouts` — extracted for independent testability (`src/server/services/workout.service.ts`)
- `workout.assign` `trainerProcedure` — builds workout template for a client, fires `PROGRAM_ASSIGNED` notification (`src/server/trpc/routers/workout.ts`)
- `workout.log` `clientProcedure` — client self-log with `status: COMPLETED` and streak milestone check (`src/server/trpc/routers/workout.ts`)
- `workout.complete` `clientProcedure` — transitions assigned workout `ASSIGNED → COMPLETED`, atomically replaces set data in a `$transaction`, fires `ACHIEVEMENT` on 7/30-day streak milestones (`src/server/trpc/routers/workout.ts`)
- `workout.delete` `trainerProcedure` — removes `ASSIGNED` workout; throws `CONFLICT` if already `COMPLETED` (`src/server/trpc/routers/workout.ts`)
- `workout.getStats` `clientProcedure` — returns `{ streak, weeklyCount, totalWorkouts, lastWorkout }` for dashboard cards (`src/server/trpc/routers/workout.ts`)
- `workout.getTrainerOverview` `trainerProcedure` — lists all mapped clients with recent workout history (`src/server/trpc/routers/workout.ts`)
- `WorkoutLogCard` component — status-badged card for workout history list with muscle group chips (`src/components/workouts/workout-log-card.tsx`)
- `WorkoutDetailSheet` component — slide-in panel with full exercise + set breakdown for a logged workout (`src/components/workouts/workout-detail-sheet.tsx`)
- `AssignWorkoutForm` component — trainer drawer: exercise library search + dynamic per-exercise set editor, submits `workout.assign` (`src/components/workouts/assign-workout-form.tsx`)
- `WorkoutLogger` component — client drawer for self-logging or completing an assigned workout, with set-by-set entry (`src/components/workouts/workout-logger.tsx`)
- Trainer workouts page — client list with "Assign" CTA and recent workout cards (`src/app/(dashboard)/trainer/workouts/page.tsx`)
- Client workouts page — tabbed Assigned / History view with "Log Workout" FAB and "Start & Log" per card (`src/app/(dashboard)/client/workouts/page.tsx`)
- Workouts nav item added to TRAINER sidebar navigation (`src/lib/constants.ts`)
- Client dashboard wired to live `workout.getStats` — shows real streak, weekly count, total, and last workout (`src/app/(dashboard)/client/page.tsx`)
- Trainer dashboard wired to live `workout.getTrainerOverview` — shows real active client count, completed this week, and pending workouts (`src/app/(dashboard)/trainer/page.tsx`)
- 24 new unit tests for `WorkoutService` (streak edge cases, weekly count, volume, access guard) and workout router (list, assign, log, complete, delete, getStats) (`src/server/services/__tests__/workout.service.test.ts`, `src/server/trpc/routers/__tests__/workout.test.ts`)
- `date-fns` installed for relative timestamp formatting (`package.json`)

### Changed (Sprint 3)
- Rewrote `workout.ts` router: replaced stub `create` with role-scoped procedures using `clientProcedure` / `trainerProcedure`; added ownership checks and role-based list filtering (`src/server/trpc/routers/workout.ts`)
- `api-contracts.md`: updated workout router table with all 8 Sprint 3 procedures and their auth/input/output shapes
- `data-flow.md`: added flows §7 (trainer assigns workout) and §8 (client completes workout)

### Added (Theming)
- Dark / light mode toggle — `ThemeToggle` component (Sun/Moon icons) in the top nav (`src/components/ui/theme-toggle.tsx`)
- `ThemeProvider` from `next-themes` wrapping the app; defaults to dark mode (`src/components/layout/providers.tsx`)
- Sector 7 brand color palette across `:root` (light) and `.dark` — orange primary `oklch(0.64 0.22 40)` derived from logo, charcoal `oklch(0.12 0.005 265)` dark background (`src/app/globals.css`)
- Logo image in sidebar header using `next/image` — drop logo file at `/public/logo.png` to activate (`src/components/layout/sidebar.tsx`)

### Added (Sprint 2 — Exercise Library)
- `Equipment` Prisma enum (11 values) replacing free-text `String?` on `Exercise.equipment`; `@@index([equipment])` added (`prisma/schema.prisma`)
- `exercise.update` and `exercise.delete` tRPC procedures (both `adminProcedure`); `delete` guards against exercises in use by workouts; `update` re-derives `mediaType` when `mediaUrl` changes (`src/server/trpc/routers/exercise.ts`)
- `detectMediaType()` helper: auto-classifies a URL as `youtube | image | video` (`src/server/trpc/routers/exercise.ts`)
- `exercise.list` now filters by `equipment` using the new enum; all enum fields use `z.nativeEnum()` instead of plain strings
- `EQUIPMENT_LABELS`, `MUSCLE_GROUP_LABELS`, `EXERCISE_CATEGORY_LABELS` display-label maps; Exercises added to TRAINER nav (`src/lib/constants.ts`)
- `ExerciseCard` component — 16:9 media thumbnail, difficulty dots, category badge, admin edit/delete overlay (`src/components/exercises/exercise-card.tsx`)
- `ExerciseFilters` component — controlled search + 4 enum dropdowns with 300 ms debounce, Clear button (`src/components/exercises/exercise-filters.tsx`)
- `ExerciseForm` component — react-hook-form + Zod, secondary-muscles toggle grid, live media preview, create/edit modes (`src/components/exercises/exercise-form.tsx`)
- `ExerciseDetailSheet` component — slide-in Sheet with YouTube iframe / img / video rendering, admin actions (`src/components/exercises/exercise-detail-sheet.tsx`)
- `DeleteExerciseDialog` component — AlertDialog with CONFLICT error surfacing (`src/components/exercises/delete-exercise-dialog.tsx`)
- Admin, Trainer, and Client exercise pages with pagination (`src/app/(dashboard)/[role]/exercises/page.tsx`)
- 31 new unit tests covering exercise router (13), exercise card (11), exercise filters (7) — 66 total, all passing

### Fixed
- Added `prisma generate` to `postinstall` and prefixed to `build` script so Vercel generates the Prisma client before Next.js compiles — fixes `Module not found: Can't resolve '@/generated/prisma/client'` and `@/generated/prisma/enums` on Vercel deployments (`package.json`)

### Added (AI Tooling)
- AI coding rules enforced via `CLAUDE.md` — CHANGELOG, inline comments, docs updates, unit tests required on every change
- Vitest test infrastructure: `vitest.config.ts`, `src/test/setup.ts`, `npm test` / `npm run test:coverage` scripts (`package.json`, `vitest.config.ts`)
- `/docs` folder with AI-readable reference files: `architecture.md`, `data-flow.md`, `api-contracts.md`, `naming-conventions.md`
- Unit tests for foundation layer: validations, utils, auth callbacks, tRPC authorization middleware

### Changed (Sprint 2)
- `exercise.list` input: added `equipment` filter, renamed `muscleGroup` → `primaryMuscle`, `type` → `category` to align with schema field names
- `api-contracts.md`: updated exercise router entries to reflect final input shapes and error codes

---

## [0.1.0] — 2026-02-28

### Added
- Full Sprint 1 foundation: Next.js 16.1.6, Prisma 7.4.2, NextAuth v5 beta, tRPC v11, Tailwind CSS v4, shadcn/ui v3
- 18-model Prisma schema (User, TrainerProfile, ClientProfile, Exercise, WorkoutLog, Notification, FcmToken, Habit, Challenge, and more)
- Role-based authentication (ADMIN, TRAINER, CLIENT) with edge-compatible proxy routing (`src/proxy.ts`)
- Triple-channel notification system: Prisma persist → Pusher real-time → Firebase Cloud Messaging push
- Mobile-first dashboard layout: bottom tab nav (mobile) + collapsible sidebar (desktop)
- PWA configuration via `@ducanh2912/next-pwa` with FCM service worker
- Zustand stores for notification state and sidebar state
- tRPC routers: auth, user, exercise, workout, notification, trainer, habit, challenge
- REST API stubs: Pusher channel auth, FCM token registration
- Admin seed user: `admin@sector7.com` / `admin123`
