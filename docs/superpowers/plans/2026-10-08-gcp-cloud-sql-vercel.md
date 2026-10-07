# GCP Cloud SQL + Vercel Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Note for whoever executes this plan:** several steps in Task 1 create real, billable GCP resources (`gcloud sql instances create` and related commands) and Task 4 performs a real `vercel` deploy. These are not safe to hand to a sandboxed subagent without direct oversight — run Task 1's provisioning steps and Task 4's deploy step yourself (the controller), with explicit confirmation before each irreversible/billable command, even if the rest of the plan is executed subagent-driven.

**Goal:** Stand up a GCP Cloud SQL Postgres instance, wire up a second local dev workflow that runs the app against it through the Cloud SQL Auth Proxy, and get the app deployed as a Vercel Preview.

**Architecture:** No application code changes. This is infrastructure + configuration: a real Cloud SQL instance, a `dev:gcp` npm script that tunnels through the Cloud SQL Auth Proxy on a separate local port from the existing Docker Postgres, and a Vercel project connected to the same Cloud SQL instance over its public IP with SSL required.

**Tech Stack:** GCP Cloud SQL for Postgres 16, Cloud SQL Auth Proxy (`cloud-sql-proxy` CLI), Vercel CLI, `concurrently` + `dotenv-cli` (new devDependencies for the local `dev:gcp` script).

## Global Constraints

- GCP project: `quattro-510922` (already exists, billing already enabled — do not create a new project).
- Region: `europe-central2`.
- Cloud SQL tier: `db-f1-micro`, Postgres 16.
- Cloud SQL networking: public IP, SSL required (`--require-ssl`), authorized network `0.0.0.0/0` — no Cloud SQL Auth Proxy, PgBouncer, or connector library on the Vercel connection path (deferred; see the design spec's "Explicitly deferred" section).
- Local dev connects to Cloud SQL only through the Cloud SQL Auth Proxy, on `127.0.0.1:5433` — never the public IP directly from a laptop.
- Clerk stays on the existing Development-mode instance; do not set up a Clerk Production instance in this plan.
- Never add `prisma migrate deploy` (or any migration command) to the Vercel build command. Migrations against Cloud SQL are always a manual, separate step run locally through the Auth Proxy.
- The first Vercel deploy in this plan is a Preview deployment. Do not run `vercel --prod` without the user's explicit go-ahead after they've checked the preview.
- Confirm with the user before any billable `gcloud sql instances create` call and before any `vercel` deploy command — these are real, hard-to-reverse actions on real infrastructure.

---

### Task 1: Provision the Cloud SQL instance, database, and app user

**Files:** None — this task is pure infrastructure provisioning via `gcloud`, run from the repo root so later tasks can reference its output.

**Interfaces:**
- Produces: a running Cloud SQL instance named `quattro-db` in `quattro-510922`/`europe-central2`; a `quattro` database on it; a `quattro_app` database user with a generated password; the instance's connection name (format `quattro-510922:europe-central2:quattro-db`) and public IP address. Tasks 2 and 3 use all four of these values.

- [ ] **Step 1: Enable the Cloud SQL Admin API**

Run:
```bash
gcloud services enable sqladmin.googleapis.com --project=quattro-510922
```
Expected: completes with no output or a confirmation that the API is already enabled.

- [ ] **Step 2: Confirm with the user, then create the Cloud SQL instance**

This is the billable, hard-to-reverse step. Before running it, confirm with the user one more time (region `europe-central2`, tier `db-f1-micro`, ~$10-12/month) even if they approved this during design — this is the actual resource-creation command.

Run:
```bash
gcloud sql instances create quattro-db \
  --project=quattro-510922 \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region=europe-central2 \
  --require-ssl \
  --authorized-networks=0.0.0.0/0
```
Expected: takes a few minutes; ends with the instance shown as `RUNNABLE`.

If the command fails with an error about `tier`/`edition` incompatibility (Cloud SQL has moved some tiers behind an explicit `--edition` flag in newer API versions), retry with `--edition=ENTERPRISE` added to the same command — this is a known, benign API variation, not a sign anything else is wrong. Do not change the tier or region to work around it.

- [ ] **Step 3: Create the `quattro` database**

Run:
```bash
gcloud sql databases create quattro --instance=quattro-db --project=quattro-510922
```
Expected: `Creating Cloud SQL database...done.`

- [ ] **Step 4: Create a dedicated application database user**

Do not use the instance's root/postgres user for the application. Generate a strong password and create a scoped user:

```bash
APP_DB_PASSWORD=$(openssl rand -base64 24)
echo "quattro_app password: $APP_DB_PASSWORD"
gcloud sql users create quattro_app \
  --instance=quattro-db \
  --project=quattro-510922 \
  --password="$APP_DB_PASSWORD"
```
Expected: `Creating Cloud SQL user...done.` Save the printed password somewhere durable (a password manager or the user's own notes) — it is not retrievable from GCP after this point, only resettable.

- [ ] **Step 5: Record the connection name and public IP**

Run:
```bash
gcloud sql instances describe quattro-db --project=quattro-510922 --format="value(connectionName)"
gcloud sql instances describe quattro-db --project=quattro-510922 --format="value(ipAddresses[0].ipAddress)"
```
Expected: the first prints `quattro-510922:europe-central2:quattro-db`; the second prints a public IPv4 address. Record both — Task 2 needs the connection name, Task 4 needs the public IP.

- [ ] **Step 6: No commit for this task**

Nothing in the repo changes in this task — skip the commit step. Carry the connection name, public IP, and `quattro_app` password forward to Task 2.

---

### Task 2: Local dev tooling — `dev:gcp` via the Cloud SQL Auth Proxy

**Files:**
- Modify: `package.json` (new devDependencies, new scripts)
- Create: `.env.gcp` (gitignored, real values — never committed)
- Create: `.env.gcp.example` (committed, placeholder values)
- Modify: `.gitignore` (add `.env.gcp` if the existing `.env*` glob doesn't already cover it — check first)

**Interfaces:**
- Consumes: the connection name, public IP, and `quattro_app` password from Task 1.
- Produces: `npm run dev:gcp` (runs the app against Cloud SQL), `npm run db:migrate:gcp`, `npm run db:seed:gcp`. Task 3 uses the latter two.

- [ ] **Step 1: Confirm `.env.gcp` is covered by `.gitignore`**

Run: `git check-ignore -q .env.gcp && echo IGNORED || echo NOT_IGNORED`
Expected: `IGNORED` (the existing `.env*` pattern in `.gitignore` already covers it, from the prior stage's setup). If `NOT_IGNORED`, add a `.env.gcp` line to `.gitignore` before proceeding — do not let real Cloud SQL credentials get committed.

- [ ] **Step 2: Install the Cloud SQL Auth Proxy binary**

Run: `brew install cloud-sql-proxy`
Expected: installs cleanly. Verify with `cloud-sql-proxy --version`.

- [ ] **Step 3: Install `concurrently` and `dotenv-cli`**

Run: `npm install -D concurrently dotenv-cli`

- [ ] **Step 4: Write `.env.gcp.example`**

```
# Cloud SQL, tunneled locally through the Cloud SQL Auth Proxy (npm run dev:gcp
# starts the proxy for you — see package.json). Never point this at the
# instance's public IP directly from a laptop.
DATABASE_URL="postgresql://quattro_app:<password>@127.0.0.1:5433/quattro"
```

- [ ] **Step 5: Write the real `.env.gcp`**

Using the `quattro_app` password generated in Task 1, Step 4:
```
DATABASE_URL="postgresql://quattro_app:<the real generated password>@127.0.0.1:5433/quattro"
```

- [ ] **Step 6: Add the new scripts to `package.json`**

In the `"scripts"` block, add (replacing `<connection-name>` with the real value from Task 1, Step 5 — e.g. `quattro-510922:europe-central2:quattro-db` — written literally, not as a shell variable, since this project has exactly one Cloud SQL instance):

```json
"dev:gcp": "concurrently -k \"cloud-sql-proxy <connection-name> --port 5433\" \"dotenv -e .env.gcp -- next dev\"",
"db:migrate:gcp": "dotenv -e .env.gcp -- prisma migrate deploy",
"db:seed:gcp": "dotenv -e .env.gcp -- tsx prisma/seed.ts"
```

Note `db:migrate:gcp` uses `prisma migrate deploy`, not `prisma migrate dev` (the local-Docker script's command) — `deploy` applies existing migrations without prompting to create new ones, which is the correct behavior against a shared/remote database.

- [ ] **Step 7: Verify the proxy tunnel connects**

In one terminal: `cloud-sql-proxy <connection-name> --port 5433` (same connection name as Step 6).
Expected: logs showing `Listening on 127.0.0.1:5433` and no connection errors.

In a second terminal, with the proxy still running:
```bash
PGPASSWORD="<the quattro_app password>" psql "host=127.0.0.1 port=5433 dbname=quattro user=quattro_app" -c "SELECT 1;"
```
Expected: returns a single row with `1`. Stop the proxy (`Ctrl+C` in the first terminal) once confirmed.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .env.gcp.example .gitignore
git commit -m "feat: add dev:gcp workflow to run the app against Cloud SQL via the Auth Proxy"
```
(`.env.gcp` itself is gitignored and must not be added.)

---

### Task 3: Migrate and seed the Cloud SQL database

**Files:** None — uses the existing `prisma/migrations/` history and `prisma/seed.ts` unchanged, pointed at Cloud SQL via `.env.gcp`.

**Interfaces:**
- Consumes: `db:migrate:gcp` and `db:seed:gcp` from Task 2.
- Produces: a Cloud SQL database with the same schema and seed data as local Docker Postgres, ready for the Vercel deploy in Task 4 to read from.

- [ ] **Step 1: Start the Auth Proxy**

Run (in its own terminal, left running for the rest of this task): `cloud-sql-proxy <connection-name> --port 5433`

- [ ] **Step 2: Apply migrations to Cloud SQL**

Run: `npm run db:migrate:gcp`
Expected: lists every migration from `prisma/migrations/` (the full history from the prior stage's plan plus this stage's, if any schema changes happened — none are expected in this plan) and ends with `All migrations have been successfully applied.`

- [ ] **Step 3: Seed Cloud SQL**

Run: `npm run db:seed:gcp`
Expected: `Seeded community <id> with 4 buildings.` — the same message the local seed script produces.

- [ ] **Step 4: Verify from the app**

Run: `npm run dev:gcp`, then in a browser visit `http://localhost:3000/packages` while signed out.
Expected: redirects to `/sign-in` (same behavior as against local Docker Postgres — confirms the app is actually reading from Cloud SQL, not silently falling back to a cached local connection). Stop `dev:gcp` (`Ctrl+C`) once confirmed.

- [ ] **Step 5: No commit for this task**

Nothing in the repo changes — this task only populates the remote database.

---

### Task 4: Vercel project setup and first Preview deploy

**Files:**
- Create: `vercel.json` only if Vercel's auto-detection needs overriding (check Step 2 first — for a standard Next.js App Router project it usually doesn't, and this task should not create the file speculatively).

**Interfaces:**
- Consumes: the Cloud SQL public IP from Task 1, and the existing local `.env`'s Clerk variable values (same values, different environment — this plan keeps Clerk on its Development-mode instance per the design's explicit decision).
- Produces: a Vercel project linked to this repo, with a working Preview deployment URL.

- [ ] **Step 1: Confirm `next build` is still green**

Run: `npm run build`
Expected: succeeds (this was already fixed as a prerequisite to this plan — removing `app/api/posts/route.ts` and fixing lint errors — this step just reconfirms nothing regressed).

- [ ] **Step 2: Link the Vercel project**

Run: `vercel link` (interactive — choose "Link to existing project?" No, create a new one; accept the detected Next.js framework settings; do not change the build command).
Expected: creates `.vercel/` locally (gitignored by Next.js's default `.gitignore`, confirm with `git check-ignore -q .vercel && echo IGNORED || echo NOT_IGNORED` — if `NOT_IGNORED`, add it before continuing) and prints the linked project name.

- [ ] **Step 3: Set environment variables on the Vercel project**

For each variable below, run `vercel env add <NAME>` (interactive — when prompted for environments, select both "Production" and "Preview"; paste the value when prompted):

- `DATABASE_URL` — `postgresql://quattro_app:<password>@<cloud-sql-public-ip>:5432/quattro?sslmode=require` (the public-IP form, not the Auth Proxy form — Vercel functions use the direct connection per the design's decision)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — same value as in the local `.env`
- `CLERK_SECRET_KEY` — same value as in the local `.env`
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL` — same value as in the local `.env`
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL` — same value as in the local `.env`
- `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` — same value as in the local `.env`
- `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` — same value as in the local `.env`

Expected: each `vercel env add` confirms the variable was added to the selected environments.

- [ ] **Step 4: Confirm with the user, then deploy to Preview**

This creates a real, publicly-reachable (if unlisted) deployment — confirm with the user before running it, even though it's a Preview, not Production.

Run: `vercel`
Expected: builds remotely and prints a Preview URL (`https://quattro-<hash>-<team>.vercel.app` or similar).

- [ ] **Step 5: Verify the Preview deployment**

Visit the Preview URL. Confirm:
- The home page loads with no server error.
- `/packages` redirects to `/sign-in` when signed out (same check as Task 3, Step 4, now against the deployed app).
- Signing in (the same way verified manually in the prior stage) reaches `/packages` and shows the seeded data from Task 3.

If any of these fail, do not proceed to a Production promotion — report the failure (Vercel's function logs, via `vercel logs <deployment-url>`, are the first place to look) rather than guessing at a fix.

- [ ] **Step 6: Commit (only if `vercel link` produced a new `vercel.json` or required a `.gitignore` addition)**

```bash
git add .gitignore vercel.json 2>/dev/null
git commit -m "chore: link Vercel project" --allow-empty-message -m "Vercel project linked; env vars set via \`vercel env add\`, not committed."
```
If `vercel link` changed nothing in the repo (the common case — `.vercel/` is local-only and gitignored, and no `vercel.json` was needed), skip this commit entirely.

---

### Task 5: Document the two local workflows and the deploy process

**Files:**
- Modify: `README.md`

**Interfaces:** None — documentation only.

- [ ] **Step 1: Add a "Running against Cloud SQL" section to `README.md`**

Insert after the existing "Setup" section (the one the prior stage's plan wrote, covering `docker compose up -d postgres` / `npm run dev`):

```markdown
## Running against Cloud SQL (GCP)

For testing against the real staging database instead of local Docker Postgres:

```bash
brew install cloud-sql-proxy   # once
cp .env.gcp.example .env.gcp   # fill in the real DATABASE_URL — ask a teammate or check the password manager entry for `quattro_app`
npm run dev:gcp                # starts the Cloud SQL Auth Proxy and the dev server together
```

To push schema changes or re-seed the Cloud SQL database:

```bash
npm run db:migrate:gcp
npm run db:seed:gcp
```

Never add a migration command to the Vercel build — migrations against Cloud SQL are always run manually, from a developer's machine, through the Auth Proxy.
```

- [ ] **Step 2: Add a "Deploying" section to `README.md`**

```markdown
## Deploying

The app is deployed on Vercel, connected to the same Cloud SQL instance used by `dev:gcp` (over its public IP with SSL required, not the Auth Proxy — Vercel's serverless functions don't have a stable local process to run a proxy in).

Before deploying a schema change, run `npm run db:migrate:gcp` locally first — the deployed app expects the schema to already exist in Cloud SQL.

```bash
vercel          # deploys a Preview
vercel --prod   # promotes to Production — only after checking the Preview
```
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document the Cloud SQL dev workflow and Vercel deploy process"
```

---

## Self-review notes

- **Spec coverage:** every decision in the design doc has a task — provisioning (Task 1), local Auth Proxy workflow (Task 2), migrate/seed against Cloud SQL (Task 3), Vercel env vars + Preview deploy (Task 4), docs (Task 5). The design's "Explicitly deferred" list (Clerk Production, connection pooling, automated migration pipeline, custom domain, HA Cloud SQL) has no task — correctly, since deferring means not building it now.
- **Type/naming consistency:** `db:migrate:gcp`/`db:seed:gcp` (Task 2) are the exact names Task 3's steps run; `.env.gcp` (Task 2) is the exact file Task 3's and Task 5's instructions reference; the connection name and public IP captured in Task 1 are the exact values Task 2 and Task 4 substitute into their commands.
- **No placeholders:** every `gcloud`/`vercel`/`npm` command is the literal command to run, not a description of one. The two spots that look like placeholders (`<connection-name>`, `<password>`) are real values the executor fills in from Task 1's own output earlier in the same plan run — not unresolved unknowns.
