# Leverage Lab

Predictive cash-flow and scenario modeling for real estate — track properties,
loans, leases, transactions, and property tax across a portfolio, with
projected cash flow and document management.

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
- **`tests/actions/`** — the Server Actions in `lib/actions.ts`, exercised
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
  `login`, `reset-password`, and `auth/confirm` (magic-link/OAuth callback).
- `components/` — UI components; `components/ui/` holds shadcn primitives,
  `components/forms/` holds data-entry forms (Server Actions + `FormData`).
- `lib/` — Supabase clients, queries, Server Actions, formatting helpers.
- `supabase/` — migrations, seed scripts, and local stack config.
