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

| Command          | Description          |
| ---------------- | -------------------- |
| `pnpm dev`       | Start the dev server |
| `pnpm build`     | Production build     |
| `pnpm lint`      | ESLint               |
| `pnpm typecheck` | `tsc --noEmit`       |

## Project structure

- `app/` — routes (App Router), grouped into `(app)` (authenticated shell),
  `login`, `reset-password`, and `auth/confirm` (magic-link/OAuth callback).
- `components/` — UI components; `components/ui/` holds shadcn primitives,
  `components/forms/` holds data-entry forms (Server Actions + `FormData`).
- `lib/` — Supabase clients, queries, Server Actions, formatting helpers.
- `supabase/` — migrations, seed scripts, and local stack config.
