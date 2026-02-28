# Naming Conventions

> AI reference — update when a new naming pattern is established.
> When in doubt: be explicit, be consistent, follow what already exists.

---

## Files & Folders

| Context | Convention | Example |
|---------|-----------|---------|
| React components | `kebab-case.tsx` | `notification-bell.tsx` |
| Hooks | `use-{name}.ts` | `use-pusher.ts` |
| Stores (Zustand) | `use-{name}-store.ts` | `use-notification-store.ts` |
| Services | `{name}.service.ts` | `notification.service.ts` |
| tRPC routers | `{name}.ts` inside `routers/` | `exercise.ts` |
| Test files | `__tests__/{source}.test.ts` | `__tests__/validations.test.ts` |
| API route handlers | `route.ts` inside named folder | `api/pusher/auth/route.ts` |
| Lib utilities | `{name}.ts` | `auth.config.ts`, `db.ts` |

---

## TypeScript

| Context | Convention | Example |
|---------|-----------|---------|
| React components | `PascalCase` function | `export function NotificationBell()` |
| Hooks | `camelCase` starting with `use` | `export function usePusher()` |
| Types / Interfaces | `PascalCase` | `type TRPCContext`, `interface NotificationPayload` |
| Zod schemas | `camelCase` + `Schema` suffix | `loginSchema`, `registerSchema` |
| Zod inferred types | `PascalCase` + `Values` or `Input` | `LoginValues`, `RegisterValues` |
| Constants | `SCREAMING_SNAKE_CASE` | `MAX_RETRY_ATTEMPTS` |
| Enum values | `SCREAMING_SNAKE_CASE` | `UserRole.ADMIN` |
| tRPC routers | `camelCase` + `Router` suffix | `exerciseRouter`, `notificationRouter` |
| Service classes | `PascalCase` + `Service` suffix | `NotificationService`, `FcmService` |

---

## Database / Prisma

| Context | Convention | Example |
|---------|-----------|---------|
| Model names | `PascalCase` singular | `User`, `WorkoutLog`, `FcmToken` |
| Field names | `camelCase` | `passwordHash`, `createdAt` |
| Enum names | `PascalCase` | `UserRole`, `NotificationType` |
| Enum values | `SCREAMING_SNAKE_CASE` | `ACTIVE`, `WORKOUT_ASSIGNED` |
| Relation fields | singular for one, plural for many | `user` (belongs-to), `workoutLogs` (has-many) |

---

## API / tRPC

| Context | Convention | Example |
|---------|-----------|---------|
| Router key in appRouter | `camelCase` singular | `exercise`, `notification` |
| Procedure names | `camelCase` verb-first | `getById`, `create`, `markRead`, `markAllRead` |
| Input variable | `input` | `procedure.input(schema)` |
| REST route folders | `kebab-case` | `api/v1/notifications/register-token` |

---

## React / UI

| Context | Convention | Example |
|---------|-----------|---------|
| Component props type | `{ComponentName}Props` | `type NotificationBellProps` |
| Event handlers | `on{Event}` for props, `handle{Event}` for implementations | `onClick` prop, `handleClick` function |
| Boolean props | `is`, `has`, `can`, `should` prefix | `isOpen`, `hasUnread`, `canEdit` |
| Zustand store actions | verb form | `addNotification`, `markRead`, `resetUnread` |

---

## Environment Variables

| Context | Convention | Example |
|---------|-----------|---------|
| Server-only | `SCREAMING_SNAKE_CASE` | `PUSHER_SECRET`, `DATABASE_URL` |
| Client-exposed | `NEXT_PUBLIC_` prefix | `NEXT_PUBLIC_PUSHER_APP_KEY` |

---

## Imports Order (enforced by ESLint)

1. Node built-ins (`path`, `fs`)
2. External packages (`next`, `react`, `zod`)
3. Internal `@/` aliases (absolute)
4. Relative imports (avoid — use `@/` instead)

---

## Comments

- Use `//` for single-line, `/* */` only for JSDoc on exported functions
- Above any abstraction: explain **why** it exists, not what it does
- Never commit `// TODO` without a linked issue or sprint reference
- `// HACK:` and `// FIXME:` are allowed if they explain the root cause
