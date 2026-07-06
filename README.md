# Leverage Lab

Predictive cash-flow and scenario modeling for real estate — track properties,
loans, leases, transactions, and property tax across a portfolio, with
projected cash flow and document management. Properties can have co-owners
(e.g. a couple) with fully equal access, via an invite-by-link flow.

## Stack

- **Next.js 14** (App Router) + React 18 + TypeScript
- **Supabase** (Postgres, Auth, Storage) via `@supabase/ssr`
- **Tailwind CSS v4** + **shadcn/ui** (Radix primitives, `new-york` style)
- Dark-mode-first, system-preference driven (no manual toggle)

## Getting started

```bash
pnpm install
supabase start        # local Postgres/Auth/Storage stack
cp .env.example .env.local   # fill in values from `supabase start` output
node_modules/.bin/next dev   # `pnpm dev` can misbehave under some pnpm/mise setups — this is the reliable path
```

App runs at `http://localhost:3000`. Local auth emails (magic link, password
reset) land in Mailpit at `http://127.0.0.1:54324`.

### Environment variables

See `.env.example` for the full list. Browser-safe `NEXT_PUBLIC_*` values and
the server-only `SUPABASE_SERVICE_ROLE_KEY` come from `supabase start` for
local dev, or the cloud project's dashboard (Settings → API) for production.

### Database

Migrations live in `supabase/migrations`; seed data (a single bootstrap owner

- one example property) lives in `supabase/seed`. To rebuild the local DB from
  scratch:

```bash
supabase db reset
```

Data isn't included in `seed.sql` by default — restore from a dump or re-run
the seed scripts as needed.

## Scripts

| Command           | Description                  |
| ----------------- | ---------------------------- |
| `pnpm dev`        | Start the dev server         |
| `pnpm build`      | Production build             |
| `pnpm lint`       | ESLint                       |
| `pnpm typecheck`  | `tsc --noEmit`               |
| `pnpm test`       | Run the full test suite once |
| `pnpm test:watch` | Run tests in watch mode      |

## Testing

Vitest, with three kinds of coverage:

- **`tests/unit/`** — pure TypeScript logic (`lib/format.ts`). No dependencies.
- **`tests/db/`** — the Postgres layer itself: mortgage math, the Texas
  multi-jurisdiction tax engine (exemption clamping, homestead), cashflow
  projections, the yields view, and the multi-owner RLS/invite model. These
  call the real SQL functions/RLS policies via `@supabase/supabase-js`
  against your **local** `supabase start` stack — nothing is mocked, so a bug
  in a migration shows up as a failing test, not just a wrong number in the UI.
- **`tests/actions/`** — the Server Actions in `lib/actions/*`, exercised
  end-to-end (validation → real DB write → real RLS) by mocking `next/headers`
  and `next/cache` (see `tests/setup/mockNext.ts`) so a real signed-in
  Supabase session can flow through `lib/supabase/server.ts` outside of an
  actual Next.js request.

Every DB-backed test creates its own throwaway auth user(s) and property via
the Supabase service-role key, and tears them down afterward — tests don't
depend on or mutate the seeded 117 Willow Cove data, so they're safe to run
against your regular dev stack.

```bash
supabase start   # tests need the local stack up
pnpm test
```

Component rendering tests are intentionally out of scope for now — most
components here are thin server-rendered wrappers around already-tested
data/formatting, so the DB and Server Action layers are where bugs actually
hide.

## Project structure

- `app/` — routes (App Router), grouped into `(app)` (authenticated shell),
  `login`, `reset-password`, `auth/confirm` (magic-link/OAuth callback), and
  `invites/[token]` (co-owner invite acceptance).
- `components/` — UI components; `components/ui/` holds shadcn primitives,
  `components/forms/` holds data-entry forms (Server Actions + `FormData`) and
  the shared dialog/selection patterns described below.
- `lib/actions/` — Server Actions, split by domain (`properties`, `leases`,
  `transactions`, `homestead`, `documents`, `co-ownership`) plus `shared.ts`
  for the bits every action needs. `lib/actions.ts` is a barrel
  (`export * from "./actions/x"`) so existing `import { x } from "@/lib/actions"`
  call sites never need to change when an action moves between domain files.
- `lib/queries/` — read queries, split the same way, with `lib/queries.ts` as
  the matching barrel.
- `lib/hooks/` — shared client-side React hooks (`useSelection`, for
  checkbox-row bulk selection on filterable/sortable lists).
- `supabase/` — migrations, seed scripts, and local stack config.

## Conventions

Patterns worth reusing rather than re-implementing:

- **Every Server Action** starts with
  `const auth = await requireUser(); if (!auth.ok) return { error: auth.error };`
  (`lib/actions/shared.ts`). Note it's an explicit `ok: true/false` discriminant,
  not `"error" in auth` — every field on `ActionState` is optional, so `in`
  doesn't reliably narrow the union.
- **Add/edit dialogs** use `FormDialogButton`
  (`components/forms/FormDialogButton.tsx`): pass `action`, `title`,
  `submitLabel`, a `trigger`, and the field markup as `children` — it owns the
  open state, resets and closes the form on success, and renders the error
  message. Skip it only if the dialog must stay open after success (see
  `CoOwnersCard`'s invite form, which shows the generated invite link).
- **Delete confirmations** use `ConfirmDeleteButton` (single item) or
  `BulkDeleteBar` (multi-select, built on `useSelection`) in
  `components/forms/`. Both close their `AlertDialog` only once the Server
  Action reports success — `AlertDialogAction` closes on click by default,
  which used to unmount the form (and silently drop the in-flight delete)
  before it could complete.
- **Filterable/sortable lists** (Documents, Transactions) share
  `lib/hooks/useSelection.ts` for row selection and
  `components/forms/SortDirectionButton.tsx` for the asc/desc toggle.
- **SQL**: the Texas tax exemption clamp — `clamp(flat + percent*base, min,
  max)` — lives once in `exemption_amount_cents()` (migration 0005); every
  function touching exemptions calls it instead of carrying its own copy.
