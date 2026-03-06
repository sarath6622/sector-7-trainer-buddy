# Changelog

All notable changes to Sector 7 — Trainer Buddy are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

AI assistants: add entries under `[Unreleased]` for every modification per CLAUDE.md rules.

---

## [Unreleased]

### Added (Sprint 18 — In-App Trainer-Client Messaging)
- `prisma/schema.prisma` — added `Conversation` model (`@@unique([trainerId, clientId])` — one thread per pair), `Message` model (`senderId + receiverId → User.id` for O(1) unread queries), back-relations on `TrainerProfile`, `ClientProfile`, and `User` (`sentMessages`, `receivedMessages`); schema synced with `prisma db push` (`prisma/schema.prisma`)
- `src/server/trpc/routers/message.ts` — `messageRouter` with 6 procedures: `getOrCreateConversation` (`trainerProcedure`, upserts thread + verifies active mapping), `listConversations` (`protectedProcedure`, returns trainer or client threads based on role + last message preview + per-conversation unread count), `getThread` (`protectedProcedure`, cursor-paginated newest-first + `assertParticipant` guard), `send` (`protectedProcedure`, creates message + updates `lastMessageAt` + fires `TRAINER_MESSAGE` triple-channel notification fire-and-forget), `markRead` (bulk `updateMany` for caller's unread), `unreadCount` (scalar count for nav badge) (`src/server/trpc/routers/message.ts`)
- `src/components/messages/message-sheet.tsx` — right-side Sheet (`sm:max-w-md`) shared by both entry points; trainer path calls `getOrCreateConversation` on open, client path accepts `conversationId` directly; polls `getThread` every 3 s while open for near-real-time updates; calls `markRead` on mount; chat bubble layout with avatar, rounded bubbles, timestamps; Enter to send (`src/components/messages/message-sheet.tsx`)
- `src/app/(dashboard)/client/messages/page.tsx` — client inbox listing all trainer conversations: avatar + name + last message preview + unread badge + relative timestamp; click opens `MessageSheet`; empty state with instructions (`src/app/(dashboard)/client/messages/page.tsx`)
- 18 unit tests covering all 6 router procedures including happy paths, FORBIDDEN non-participant, NOT_FOUND, UNAUTHORIZED, cursor pagination, and zero-unread edge cases (`src/server/trpc/routers/__tests__/message.test.ts`)

### Changed (Sprint 18 — In-App Trainer-Client Messaging)
- `src/server/trpc/router.ts` — registered `messageRouter` in `appRouter` (`src/server/trpc/router.ts`)
- `src/lib/constants.ts` — added `{ label: 'Messages', href: '/client/messages', icon: 'MessageSquare' }` to CLIENT nav between Community and Profile (`src/lib/constants.ts`)
- `src/components/layout/sidebar.tsx` — added `MessageSquare` to lucide-react imports and `ICON_MAP` (`src/components/layout/sidebar.tsx`)
- `src/components/trainer/client-card.tsx` — added `onMessage?: (clientProfileId, name?) => void` prop + "Message" ghost button below "Assign Workout" with `e.stopPropagation()` (`src/components/trainer/client-card.tsx`)
- `src/app/(dashboard)/trainer/clients/page.tsx` — added `messagingClient` state, wired `onMessage` on `ClientCard`, rendered `MessageSheet` (`src/app/(dashboard)/trainer/clients/page.tsx`)

### Added (Sprint 16 — Offline Mode)
- `src/lib/indexed-db.ts` — IndexedDB schema and typed accessor functions using `idb`; two object stores: `pendingWorkouts` (offline mutation queue keyed by client UUID) and `exerciseCache` (offline exercise search cache with name index) (`src/lib/indexed-db.ts`)
- `src/stores/use-offline-store.ts` — Zustand store tracking `pendingCount`, `isSyncing`, and `lastSyncAt` for offline UI state; `decrementPendingCount` clamps at 0 (`src/stores/use-offline-store.ts`)
- `src/hooks/use-offline-sync.ts` — bootstraps `pendingCount` from IndexedDB on mount; drains the queue via the raw tRPC client in FIFO order on reconnect; stops on first error so failed items remain for the next retry; exports `OfflineSyncMounter` wrapper component (`src/hooks/use-offline-sync.ts`)
- `src/components/shared/offline-banner.tsx` — sticky dashboard banner: red when offline (with pending count), amber "Syncing…" when flushing, hidden when online+synced; uses `WifiOff` / `Loader2` from lucide-react (`src/components/shared/offline-banner.tsx`)
- Unit tests — 8 cases for `useOfflineStore` and 7 cases for `useOfflineSync` (bootstrap, log flush, complete flush, empty queue, isSyncing guard, stop-on-error, partial flush) (`src/stores/__tests__/use-offline-store.test.ts`, `src/hooks/__tests__/use-offline-sync.test.ts`)

### Changed (Sprint 16 — Offline Mode)
- `WorkoutLogger.onSubmit` detects `!isOnline` and persists the workout to the IndexedDB queue with a "Workout saved offline" toast instead of calling tRPC; submit button shows `WifiOff` icon and "Save Offline" label when offline; exercise data is cached in IndexedDB via `useEffect` on every successful `exercise.list` fetch (`src/components/workouts/workout-logger.tsx`)
- Dashboard layout mounts `OfflineSyncMounter` (renders null) and `OfflineBanner` at the top of the content column (`src/app/(dashboard)/layout.tsx`)
- `next.config.ts` — added Workbox `runtimeCaching` with `NetworkFirst` strategy for `/api/trpc/exercise.list` (5 s network timeout, 24 h cache TTL) so exercise search works offline (`next.config.ts`)

### Added (Sprint 17 — Community Announcements + Achievements)
- `src/server/trpc/routers/announcement.ts` — `announcementRouter` with 5 procedures: `list` (cursor-paginated, sorted pinned-first; `protectedProcedure`), `listAll` (admin management view, no pagination), `create` (creates announcement + broadcasts `SYSTEM_ANNOUNCEMENT` notification to all ACTIVE users fire-and-forget + audits), `pin`/`unpin` (toggle `isPinned`), `delete` (hard delete + audit `ANNOUNCEMENT_DELETE`); all mutating procedures are `adminProcedure` (`src/server/trpc/routers/announcement.ts`)
- `src/server/trpc/routers/achievement.ts` — `achievementRouter` with `list` (`clientProcedure`, returns caller's badges with merged display metadata) and `getAll` (`trainerProcedure`, trainer views any user's badges); exports `awardAchievement(db, userId, type)` idempotent helper that creates a `UserAchievement` row and fires an `ACHIEVEMENT` notification only if the badge is not already earned (`src/server/trpc/routers/achievement.ts`)
- `Announcement` and `UserAchievement` models added to Prisma schema; `AchievementType` enum (7 values: `FIRST_WORKOUT`, `STREAK_7`, `STREAK_30`, `STREAK_100`, `WORKOUTS_10`, `WORKOUTS_50`, `WORKOUTS_100`); back-relations added to `User`; schema synced with `prisma db push` (`prisma/schema.prisma`)
- Admin Announcements page (`/admin/announcements`) — `PageHeader` + `CreateAnnouncementDialog` (title Input, body Textarea, isPinned Switch); list of `AnnouncementCard`s with Pin/Unpin toggle and `AlertDialog`-confirmed delete; Megaphone icon in admin sidebar (`src/app/(dashboard)/admin/announcements/page.tsx`)
- Client Community page — added `AnnouncementsFeed` section (above challenges) showing paginated pinned-first announcements with `formatDistanceToNow` timestamps; added `MyAchievements` section (below challenges) showing badge grid with emoji + title + earnedAt date; original challenges section preserved unchanged (`src/app/(dashboard)/client/community/page.tsx`)
- 13 unit tests for `announcement` router covering `list` (pagination cursor, UNAUTHORIZED), `create` (happy path + audit, FORBIDDEN for CLIENT/TRAINER), `pin`/`unpin` (happy path, NOT_FOUND), `delete` (happy path + audit, NOT_FOUND, FORBIDDEN for CLIENT) (`src/server/trpc/routers/__tests__/announcement.test.ts`)
- 7 unit tests for `awardAchievement` (creates badge + notification when new; skips both when already earned) and `achievement.list` (metadata merge, empty array, UNAUTHORIZED) and `achievement.getAll` (TRAINER happy path, FORBIDDEN for CLIENT) (`src/server/trpc/routers/__tests__/achievement.test.ts`)

### Changed (Sprint 17 — Community Announcements + Achievements)
- `workout.ts` — replaced `checkAndSendStreakNotification` with `checkAndAwardAchievements(db, clientProfileId, userId)`: runs streak + total workout count in parallel after each log/complete and calls `awardAchievement` for all applicable milestones using `>=` thresholds (handles batch offline syncs); `FIRST_WORKOUT` uses `=== 1` to fire exactly once (`src/server/trpc/routers/workout.ts`)
- `src/server/trpc/router.ts` — registered `announcementRouter` and `achievementRouter` in `appRouter` (`src/server/trpc/router.ts`)
- `src/lib/constants.ts` — added `{ label: 'Announcements', href: '/admin/announcements', icon: 'Megaphone' }` to ADMIN nav between Challenges and Audit Log (`src/lib/constants.ts`)
- `src/components/layout/sidebar.tsx` — added `Megaphone` to `ICON_MAP` and lucide-react imports (`src/components/layout/sidebar.tsx`)

### Added (Sprint 15 — Workout Calendar)
- `workout.getScheduled` `clientProcedure` — returns workouts in a date range for the calendar view; CLIENT sees only their own logs, TRAINER sees all active-mapped clients' workouts with `clientName`/`clientImage` (`src/server/trpc/routers/workout.ts`)
- `WorkoutCalendar` shared component — month grid calendar built with date-fns; colour-coded chips by status (ASSIGNED=blue, IN_PROGRESS=yellow, COMPLETED=green, SKIPPED=gray); prev/next month nav; status legend; `onWorkoutClick` + `showClientName` props (`src/components/workouts/workout-calendar.tsx`)
- Trainer Workouts page — added **Calendar** tab alongside existing Overview tab; calendar shows all active clients' workouts with client names on chips (`src/app/(dashboard)/trainer/workouts/page.tsx`)
- Client Workouts page — added **Calendar** tab as third tab alongside Assigned and History; clicking a workout chip opens the detail sheet (`src/app/(dashboard)/client/workouts/page.tsx`)
- 9 unit tests for `getScheduled` covering CLIENT/TRAINER paths, no-profile guards, empty mapping, clientId filter, and UNAUTHORIZED (`src/server/trpc/routers/__tests__/workout.calendar.test.ts`)

### Added (Sprint 14 — Admin Audit Log)
- `src/lib/audit.ts` — fire-and-forget `writeAudit(db, userId, action, entity, entityId, details?)` helper; never throws so callers always succeed
- `auditLog.list` `adminProcedure` — paginated audit log with filters: userId, action prefix (`USER_`, `CLIENT_`, `CHALLENGE_`), entity, dateFrom, dateTo; returns logs with full actor user details (`src/server/trpc/routers/auditLog.ts`)
- Instrumented `user.create`, `user.updateStatus`, `user.deactivate` with `USER_CREATE`, `USER_STATUS_UPDATE`, `USER_DEACTIVATE` audit entries (`src/server/trpc/routers/user.ts`)
- Instrumented `trainer.assignClient`, `trainer.removeAssignment` with `CLIENT_ASSIGN`, `CLIENT_UNASSIGN` audit entries (`src/server/trpc/routers/trainer.ts`)
- Instrumented `challenge.activate`, `challenge.cancel` with `CHALLENGE_ACTIVATE`, `CHALLENGE_CANCEL` audit entries (`src/server/trpc/routers/challenge.ts`)
- Admin Audit Log page (`/admin/audit-log`) — filterable table (action type, date range) with actor avatar, colour-coded action badge, entity + ID, expandable JSON details panel, pagination; `ScrollText` icon added to admin sidebar (`src/app/(dashboard)/admin/audit-log/page.tsx`)
- 10 unit tests covering pagination, totalPages, all filter types, skip offset, and role/auth guards (`src/server/trpc/routers/__tests__/auditLog.test.ts`)

### Added (Sprint 13 — Trainer Schedule & Availability)
- `trainer.addAvailabilityBlock` `trainerProcedure` — creates a blocked date range with optional reason; validates end > start (`src/server/trpc/routers/trainer.ts`)
- `trainer.removeAvailabilityBlock` `trainerProcedure` — deletes an owned availability block; throws FORBIDDEN if the block belongs to a different trainer (`src/server/trpc/routers/trainer.ts`)
- Trainer Schedule page (`/trainer/schedule`) rebuilt from ComingSoon stub — toggleable "Block Dates" form, BlockCard list with Active now / Upcoming / Past badges, summary stat cards for active+upcoming and past counts, sorted (active/upcoming chronologically first, past at bottom) (`src/app/(dashboard)/trainer/schedule/page.tsx`)
- 12 unit tests for `addAvailabilityBlock` and `removeAvailabilityBlock` covering happy paths, date validation, ownership guard, missing profile, role guards, and UNAUTHORIZED (`src/server/trpc/routers/__tests__/trainer.availability.test.ts`)

### Fixed (Sprint 12 — Notification Inbox)
- `NotificationBell` now fetches `notification.unreadCount` from the server on mount via `useQuery` and syncs it to the Zustand store — fixes badge showing 0 for pre-existing unread notifications (`src/components/notifications/notification-bell.tsx`)
- `markRead` and `markAllRead` mutations now also invalidate the `notification.unreadCount` query key so the badge immediately reflects the new count after reading (`src/components/notifications/notification-center.tsx`)
- 11 unit tests for `notification.list`, `notification.unreadCount`, `notification.markRead`, and `notification.markAllRead` covering happy paths, pagination cursor, and UNAUTHORIZED guard (`src/server/trpc/routers/__tests__/notification.test.ts`)

### Added (Sprint 11 — Challenges & Leaderboard)
- `challenge.listAll` `adminProcedure` — returns all challenges across all statuses for the admin management page (`src/server/trpc/routers/challenge.ts`)
- `challenge.activate` `adminProcedure` — transitions DRAFT → ACTIVE; throws BAD_REQUEST if not DRAFT (`src/server/trpc/routers/challenge.ts`)
- `challenge.cancel` `adminProcedure` — transitions DRAFT/ACTIVE → CANCELLED (`src/server/trpc/routers/challenge.ts`)
- `challenge.join` updated with ACTIVE-status guard; uses upsert to allow re-joining after opting out (`src/server/trpc/routers/challenge.ts`)
- `challenge.leave` `protectedProcedure` — soft opt-out sets `optedOut=true`, preserving participation history (`src/server/trpc/routers/challenge.ts`)
- `challenge.getLeaderboard` `protectedProcedure` — computes live scores for WORKOUT_COUNT and TOTAL_VOLUME types; returns ranked entries with `isMe` flag (`src/server/trpc/routers/challenge.ts`)
- Admin Challenges page (`/admin/challenges`) — lists all challenges with status/type badges, participant count, Activate/Cancel buttons, and Create Challenge dialog (`src/app/(dashboard)/admin/challenges/page.tsx`)
- Client Community page (`/client/community`) — ACTIVE challenges with join/leave buttons and collapsible leaderboard panel; 🥇🥈🥉 medals for top 3 (`src/app/(dashboard)/client/community/page.tsx`)
- 18 unit tests for activate, cancel, join, leave, and getLeaderboard (`src/server/trpc/routers/__tests__/challenge.test.ts`)

### Added (Sprint 9 — Admin Analytics Dashboard)
- `user.getAdminAnalytics` `adminProcedure` — returns 4 data sets in a single call: user growth (new CLIENT signups per week × 12 weeks), platform activity (completed workouts per week × 12 weeks), top 10 exercises by usage count, and per-trainer comparison (client count + completedLast30) sorted by activity (`src/server/trpc/routers/user.ts`)
- Admin dashboard rebuilt with 4 Recharts chart panels: New Members line chart, Platform Activity bar chart, Top Exercises horizontal bar chart, and Trainer Comparison avatar list — alongside the existing 3 stat cards (`src/app/(dashboard)/admin/page.tsx`)
- 8 new tests for `getAdminAnalytics` covering zero-fill, week bucketing, exercise name resolution, trainer comparison aggregation, and role guards (`src/server/trpc/routers/__tests__/user.test.ts`)

### Added (Sprint 8 — Trainer Performance Dashboard)
- `workout.getTrainerPerformance` `trainerProcedure` — single batched query returning per-client metrics (completedLast30, completedAllTime, pendingAssigned, lastActive) plus aggregated stats (retentionRate, avgWorkoutsPerClientPerWeek, completionRate, pendingTotal) (`src/server/trpc/routers/workout.ts`)
- Trainer dashboard rebuilt with 4 stat cards (Active Clients, Retention Rate, Avg/Client/Week, Completion Rate), a Recharts BarChart of client activity over the last 30 days, and a per-client status list with last-active label and pending badge (`src/app/(dashboard)/trainer/page.tsx`)
- 5 new tests for `getTrainerPerformance` covering aggregation logic, empty states, and role guards (32 total in workout suite) (`src/server/trpc/routers/__tests__/workout.test.ts`)

### Added (Sprint 7 — Client Progress Dashboard)
- `workout.getProgressData` `clientProcedure` — per-session max weight for a chosen exercise over N weeks; powers the strength progression line chart (`src/server/trpc/routers/workout.ts`)
- `workout.getWeeklyVolume` `clientProcedure` — weekly training volume (Σ sets × reps × weightKg) for last N weeks with zero-filled gaps; powers the weekly bar chart (`src/server/trpc/routers/workout.ts`)
- `workout.getPersonalRecords` `clientProcedure` — best working set per exercise ever logged, sorted by weight (`src/server/trpc/routers/workout.ts`)
- Client Progress page (`/client/progress`) — Personal Records grid, Strength Progression LineChart with exercise picker, Weekly Volume BarChart, 16-week consistency heatmap (`src/app/(dashboard)/client/progress/page.tsx`)
- "Progress" nav item added to CLIENT sidebar with `TrendingUp` icon (`src/lib/constants.ts`, `src/components/layout/sidebar.tsx`)
- Recharts installed as production dependency
- 10 new tests for the three new procedures added to workout test suite (`src/server/trpc/routers/__tests__/workout.test.ts`)

### Added (Sprint 10 — Habit Tracking)
- `HabitCard` component — displays a single habit with today's value, progress bar, streak badge, and inline edit/log form; streak calculated client-side from 30-day window (`src/components/habits/habit-card.tsx`)
- Habit tracking page (`/client/habits`) — date navigation (prev/next day, capped at today), 5 built-in habit cards (Water, Sleep, Steps, Protein, Calories), daily completion counter, skeleton loading states (`src/app/(dashboard)/client/habits/page.tsx`)
- Unit tests for `habit.list` and `habit.log`: happy path, missing profile, all valid types, and UNAUTHORIZED guard (`src/server/trpc/routers/__tests__/habit.test.ts`)

### Changed (Docs — Sprint 10)
- `docs/api-contracts.md` — replaced stale `habit` router table with accurate `habit.list` and `habit.log` procedure contracts

### Added
- `user.getAdminStats` `adminProcedure` — single query returning `totalUsers` (CLIENT count), `totalTrainers` (TRAINER count), and `totalExercises` for the admin dashboard (`src/server/trpc/routers/user.ts`)
- Admin dashboard now fetches and displays live data via `user.getAdminStats`; removed the irrelevant "Workouts Today" card; shows skeleton loaders while fetching (`src/app/(dashboard)/admin/page.tsx`)
- Unit tests for `user.getAdminStats`: happy path, zero counts, and FORBIDDEN/UNAUTHORIZED guards (`src/server/trpc/routers/__tests__/user.test.ts`)

### Added
- Coming-soon stub pages for all unimplemented nav routes: `/trainer/schedule`, `/client/habits`, `/client/community`, `/admin/challenges` — prevents 404 (`src/app/(dashboard)/*/*/page.tsx`)
- Shared `ComingSoonPage` component with animated ping badge and back-navigation (`src/components/shared/coming-soon-page.tsx`)

### Changed (Docs — per AI Coding Rules)
- `docs/api-contracts.md` — replaced stale `trainer` router table with all 8 Sprint 4 procedures; added full `profile` router section (4 procedures); updated `user` router with `create`, `updateStatus`, `deactivate`, and `search` additions
- `docs/data-flow.md` — appended flows 9–12: admin creates user, admin assigns trainer to client, client views their trainer card, trainer completes profile
- `docs/architecture.md` — updated layer map (added `profile` router, `WorkoutService`, sub-page lists per role), added `TrainerClientMapping` design notes, added `profileCompleted` onboarding pattern documentation, corrected model count to 19

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
