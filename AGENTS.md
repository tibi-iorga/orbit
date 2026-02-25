# Agents

## Cursor Cloud specific instructions

### Overview

Orbit is a customer feedback management and product prioritization platform. It is a single Next.js 14 application located in `/workspace/app/` with a PostgreSQL database via Prisma ORM.

### Services

| Service | Required | How to run |
|---|---|---|
| PostgreSQL | Yes | `sudo pg_ctlcluster 16 main start` |
| Next.js dev server | Yes | `cd app && npm run dev` (port 3000) |

### Database

- Local PostgreSQL with user `orbit` / password `orbit` and database `orbit`
- Connection: `postgresql://orbit:orbit@localhost:5432/orbit?schema=public`
- The `.env` file in `/workspace/app/` must have `DATABASE_URL` and `DATABASE_POSTGRES_URL_NON_POOLING` set (the Prisma schema references the latter for `directUrl`)
- Schema push: `cd app && npx prisma db push`
- Seed: `cd app && npm run db:seed` (creates admin user `admin@example.com` / `changeme` and default dimensions)

### Lint / Build / Dev

- Lint: `cd app && npm run lint` (exits 0 with one pre-existing warning about a missing useEffect dependency)
- Build: `cd app && npm run build` (runs `prisma generate && next build`)
- Dev: `cd app && npm run dev` (starts on port 3000)

### Gotchas

- The project did not ship with an `.eslintrc.json`. One was created with `"extends": "next"` and `"react/no-unescaped-entities": "off"` to work around pre-existing unescaped entity issues in the codebase.
- ESLint 8 and `eslint-config-next@14.2.18` were added as dev dependencies to match the Next.js 14.2 version. ESLint 9 is incompatible with Next.js 14.
- The Prisma schema uses `env("DATABASE_POSTGRES_URL_NON_POOLING")` for `directUrl`, not `DIRECT_URL` as the `.env.example` might suggest.
- FTS and RLS migration SQL files referenced by `db:migrate:fts` and `db:migrate:rls` scripts do not exist in the repository. The app works without them for development.
- OpenAI API key is optional. AI features (auto-grouping, text improvement, report summaries) will not work without it, but the rest of the app functions normally.
- Auth: credentials-based via NextAuth v4 with JWT sessions. `NEXTAUTH_SECRET` must be set in `.env`.
