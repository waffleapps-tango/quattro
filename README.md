# quattro

Community management system for housing communities: resident, receptionist,
manager, and admin roles over a multi-tenant Community → Building →
Apartment hierarchy, with package reception/pickup as the first feature.

## Requirements

- Node.js 20+
- Docker (for local Postgres), or your own Postgres 16 instance
- A Clerk account with Google OAuth enabled (https://dashboard.clerk.com)

## Setup

```bash
npm install
cp .env.example .env
# fill in .env: DATABASE_URL (see docker-compose.yml) and the Clerk keys
docker compose up -d postgres
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000.

## Scripts

- `npm run dev` — start the Next.js dev server
- `npm run build` / `npm run start` — production build/serve
- `npm test` — run the Vitest suite (needs the Postgres container running)
- `npm run db:migrate` — apply Prisma migrations
- `npm run db:seed` — seed a dev community, buildings, apartments, users, and packages

## Claude skills

- `/stitch-prompt <route>` — generates a ready-to-paste Google Stitch prompt for one screen
  (e.g. `/stitch-prompt /packages`, optionally with a role). It reads the route's real code and
  uses `docs/stitch-screen-prompts.md` (shared design-system block + one prompt per screen) as the
  template library. Skill lives in `.claude/skills/stitch-prompt/SKILL.md`.

## Architecture

See `docs/superpowers/specs/2026-10-06-foundation-tenant-packages-design.md`
for the current design (tenant model, authorization, package flow) and
what's deliberately deferred to later stages (invitations, announcements,
issues).
