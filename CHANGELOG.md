# Changelog

All notable changes to Sector 7 — Trainer Buddy are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

AI assistants: add entries under `[Unreleased]` for every modification per CLAUDE.md rules.

---

## [Unreleased]

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
