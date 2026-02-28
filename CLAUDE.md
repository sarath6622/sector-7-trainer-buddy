# Sector 7 — AI Coding Rules

These rules apply to every change made by an AI assistant in this project.
They are NOT optional. Follow all of them on every task.

---

## 1. CHANGELOG

Every modification must add an entry to `CHANGELOG.md` under `[Unreleased]`.

Format:
```
### Added | Changed | Fixed | Removed
- <what changed and why> (`path/to/file.ts`)
```

One bullet per logical change. Do not batch unrelated changes into one bullet.

---

## 2. Inline Comments

Add an inline comment above every abstraction you introduce:
- Custom hooks
- Middleware / tRPC procedures
- Service-layer functions
- Utility functions
- Non-obvious data transformations

Keep comments under 2 lines. Explain **why**, not what the code literally does.

Example:
```ts
// Prevents duplicate FCM token entries per device while rotating stale ones
static async registerToken(userId: string, token: string, device?: string) { ... }
```

---

## 3. Docs — Update After Architectural Changes

The `/docs` folder contains AI-readable reference files. Update the relevant file
whenever you make an architectural change (new model, new API endpoint, new data
flow, new naming pattern).

| File | Update when |
|------|-------------|
| `docs/architecture.md` | New service, new layer, new third-party integration |
| `docs/data-flow.md` | New data path through the system |
| `docs/api-contracts.md` | New tRPC router/procedure or REST endpoint |
| `docs/naming-conventions.md` | New naming pattern established |

Do not rewrite these files. Append or edit the relevant section only.

---

## 4. Unit Tests

Every code change must be accompanied by a unit test.

Rules:
- Test file lives next to the source in a `__tests__/` folder
- File name mirrors the source: `foo.ts` → `__tests__/foo.test.ts`
- Cover: happy path, edge cases, and failure/error cases
- Mock external dependencies (Prisma, Pusher, FCM) — never hit real services
- All tests must pass before considering a task done

Run tests:
```bash
npm test            # watch mode
npm run test:coverage  # coverage report
```

---

## 5. Project Conventions (quick reference)

- **Imports**: use `@/` alias, never relative `../../`
- **Enums**: import from `@/generated/prisma/enums` (not `@prisma/client`)
- **DB client**: always use `src/lib/db.ts` singleton — never instantiate PrismaClient directly
- **Zod**: import from `'zod'` — not `'zod/v4'`
- **Server-only code**: add `import 'server-only'` at top of service files
- **Role procedures**: use `adminProcedure`, `trainerProcedure`, `clientProcedure` — never `publicProcedure` for authenticated routes
- **Tailwind**: use `cn()` from `@/lib/utils` for conditional classes

Full conventions: see `docs/naming-conventions.md`
Full architecture: see `docs/architecture.md`
