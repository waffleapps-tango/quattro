# GCP Cloud SQL + Vercel Deployment — Design

Date: 2026-10-08
Status: Approved

## Context

quattro currently runs entirely locally: Next.js dev server + a local Postgres
via `docker-compose` (set up in the prior stage's plan,
[2026-10-06-foundation-tenant-packages.md](../plans/2026-10-06-foundation-tenant-packages.md)).
This stage adds a real, remote database (GCP Cloud SQL for Postgres) and
prepares the app to deploy on Vercel, without touching any product feature
work from the prior stage.

Prerequisite work done as part of this session, before this design (small,
unambiguous, build-blocking fixes — not part of this design's scope):
removed a dead `app/api/posts/route.ts` (invalid Next.js Route export,
unused — `/posts` already runs through `actions/actions.ts`), excluded
`lib/generated/prisma` from ESLint, and fixed three pre-existing lint
errors. `next build` was failing on all of these; Vercel requires a green
build to deploy at all.

## Decisions

- **GCP project:** `quattro-510922` (already created, billing enabled)
  dedicated to this app — not shared with other projects on the account.
- **Region:** `europe-central2` (Warsaw) — closest to the seeded
  community's Polish context, lower latency than the alternative
  `europe-west1` (Belgium).
- **Cloud SQL tier:** `db-f1-micro`, Postgres 16 — cheapest available tier
  (~$10-12/month + storage). Sized for dev/staging traffic, not production
  load; this is an explicit, acceptable MVP tradeoff, not an oversight.
- **Network/connection security:** public IP with SSL required, authorized
  network `0.0.0.0/0`. Vercel serverless functions don't have static
  outbound IPs on the Hobby/Pro plan, so IP allowlisting isn't viable;
  security instead comes from SSL (`sslmode=require`) and a strong
  generated password, not network-level restriction. No Cloud SQL Auth
  Proxy, no PgBouncer, no `@google-cloud/cloud-sql-connector` package for
  the Vercel connection path — deliberately deferred for simplicity.
  **Known ceiling:** `db-f1-micro`'s default `max_connections` (~25) can be
  exhausted under concurrent serverless invocations each opening their own
  Prisma connection. Acceptable at current traffic; the upgrade path if it
  becomes real is a connection pooler (Cloud SQL's built-in pooler,
  PgBouncer, or Prisma Accelerate) sitting between Vercel and Cloud SQL.
- **Local connection to the GCP database:** via the Cloud SQL Auth Proxy
  (`cloud-sql-proxy` binary, installed via `brew install cloud-sql-proxy`),
  tunneling to `127.0.0.1:5433` (separate from the local Docker Postgres on
  `5432`, so both can run side by side). This is a different connection
  method than Vercel's because it's solving a different problem: a
  developer's laptop has no stable IP to allowlist either, but *does* run a
  real process that can hold an authenticated, encrypted proxy connection
  open — which a stateless serverless function cannot.
- **Clerk:** stays on the existing Development-mode instance for this
  deploy. A Clerk Production instance (which requires a custom domain with
  DNS records pointed at Clerk) is explicitly deferred until there's a real
  domain ready and real users are expected — premature now.
- **Migrations:** never run automatically as part of the Vercel build
  (`prisma migrate deploy` in the build command is explicitly rejected —
  concurrent/retried Vercel builds could race a migration). Migrations
  against the GCP database are a manual, deliberate step run locally
  through the Cloud SQL Auth Proxy tunnel, before pushing a schema change
  live.
- **First Vercel deploy is a Preview deployment, not Production** — the
  person confirms the preview looks right before anything is promoted with
  `vercel --prod`.

## Architecture

```
Local dev (today, unchanged):
  Next.js dev server -> localhost:5432 -> Docker Postgres

Local dev against GCP (new):
  Next.js dev server -> localhost:5433 -> Cloud SQL Auth Proxy -> Cloud SQL (private, authenticated tunnel)

Vercel (new):
  Next.js serverless functions -> Cloud SQL public IP, sslmode=require -> Cloud SQL
```

Both local paths and the Vercel path point at the same `prisma/schema.prisma`
and the same migration history — only the connection string and the
connection mechanism differ. No application code (domain layer, auth,
Server Actions) changes; this stage is infrastructure and configuration
only.

## Local tooling changes

- `package.json` gains:
  - `"postinstall": "prisma generate"` — required so Vercel's `npm install`
    regenerates the Prisma Client against the current schema; without it,
    the client bundled from a prior local build could drift from the
    schema actually deployed.
  - `"dev:gcp"`: starts the Cloud SQL Auth Proxy in the background on port
    `5433`, then `next dev` with `.env.gcp` loaded.
  - `"db:migrate:gcp"` / `"db:seed:gcp"`: same as the existing
    `db:migrate`/`db:seed` scripts but pointed at `.env.gcp` (via the
    already-installed `dotenv-cli` pattern, or an inline env override) so
    schema changes and seed data can be pushed to the GCP database through
    the same proxy tunnel.
- `.env.gcp` (new, gitignored like the existing `.env`): holds
  `DATABASE_URL="postgresql://quattro:<password>@127.0.0.1:5433/quattro"`
  for the proxy-tunneled local connection. `.env.gcp.example` (committed)
  documents the shape without the real password.

## Provisioning (run once, by the controller through `gcloud`, with explicit
confirmation before any billable `create` command)

1. Enable the Cloud SQL Admin API on `quattro-510922`.
2. Create the Cloud SQL Postgres 16 instance (`db-f1-micro`,
   `europe-central2`, public IP, SSL required).
3. Create the `quattro` database and a dedicated database user with a
   generated password (not reused from local dev).
4. Record the instance connection name (`quattro-510922:europe-central2:<instance>`)
   for the Auth Proxy, and the public IP + connection string for Vercel.

## Vercel setup

1. Link the repo via `vercel` CLI (already authenticated as the project
   owner).
2. First deploy: Preview, not Production.
3. Environment variables set in the Vercel project (Production + Preview
   scopes): `DATABASE_URL` (Cloud SQL public IP, `sslmode=require`),
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and the four
   `NEXT_PUBLIC_CLERK_*_URL` redirect vars — same values as local `.env`,
   since this deploy intentionally stays on the Development-mode Clerk
   instance.
4. Before the first deploy, the schema is migrated and seeded against
   Cloud SQL manually via `npm run db:migrate:gcp` / `npm run db:seed:gcp`
   through the Auth Proxy tunnel — the deployed app expects the schema to
   already exist; it never creates it.

## Testing

No new automated tests — this stage doesn't change application logic. The
existing Vitest suite (20 tests) continues to run against the local Docker
Postgres as it does today; it does not run against Cloud SQL. Verification
for this stage is operational: the Preview deployment loads, signs in, and
the `/packages` and `/admin` flows work against the Cloud SQL-backed
database, confirmed manually in a browser.

## Explicitly deferred to later stages

- Clerk Production instance (needs a real domain).
- Connection pooling between Vercel and Cloud SQL (PgBouncer, Cloud SQL's
  built-in pooler, or Prisma Accelerate) — only needed if `db-f1-micro`'s
  connection limit becomes a real problem.
- Automated migration-on-deploy pipeline (e.g. a GitHub Action or Vercel
  Deploy Hook that runs `prisma migrate deploy` in a controlled,
  non-racing way) — manual migration is acceptable at this stage's
  deploy frequency.
- Custom domain for Vercel / Clerk.
- High-availability Cloud SQL (regional/multi-zone) — single zone is
  acceptable for this stage.
