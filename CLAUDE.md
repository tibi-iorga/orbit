# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Orbit** — a product feedback management tool for healthcare teams. Users import CSV feature requests, cluster them into themes (manually or via AI), score each feature against configurable dimensions, and generate AI report summaries per cluster.

All application code lives in `app/`. The `planning/` folder contains product context docs.

## Commands

All commands run from `app/`:

```bash
npm run dev              # Start Next.js dev server (localhost:3000)
npm run build            # Production build (includes prisma generate)
npm run lint             # ESLint
npm run db:push          # Apply schema changes (development)
npm run db:migrate       # Create migration (development)
npm run db:migrate:deploy # Deploy migrations (production)
npm run db:generate      # Regenerate Prisma client
npm run db:seed          # Seed default dimensions + admin user (idempotent)
npm run db:studio        # Open Prisma Studio (database GUI)
```

**First-time setup:**
```bash
cd app
npm install
cp .env.example .env
# Edit .env: Add DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL, OPENAI_API_KEY
npm run db:push          # Creates database schema
npm run db:seed         # Creates admin@example.com / changeme
npm run dev
```

## Environment Variables

| Variable | Purpose | Required |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `NEXTAUTH_SECRET` | JWT signing key — generate with `openssl rand -base64 32` | Yes |
| `NEXTAUTH_URL` | App origin, e.g. `http://localhost:3000` or production URL | Yes |
| `OPENAI_API_KEY` | Used by auto-cluster and report summary routes (gpt-4o-mini) | No |

## Architecture

### Tech Stack
Next.js 14 (App Router), TypeScript, Tailwind CSS, Prisma with PostgreSQL, NextAuth v4 (credentials/JWT), OpenAI SDK, PapaParse.

### Data Model (`prisma/schema.prisma`)
- **User** — email + bcrypt password hash
- **ImportRecord** — one record per CSV upload; parent to Features
- **Feature** — a single feature request; optionally belongs to a Cluster; `scores` and `explanation` are JSON strings
- **Cluster** — a named group of Features; holds optional AI-generated `reportSummary`
- **Dimension** — a scoring axis (`yesno` or `scale` 1–3) with a weight and display order

### Routing Structure
```
src/app/
├── page.tsx                  # Redirect: → /features or /login
├── layout.tsx                # Root layout with SessionProvider
├── (app)/                    # Route group — auth-guarded via layout.tsx
│   ├── layout.tsx            # Server component: checks session, wraps AppLayout
│   ├── features/page.tsx     # Main view: feature table, scoring, clustering
│   ├── import/page.tsx       # CSV upload and column mapping
│   ├── settings/page.tsx     # Dimension CRUD
│   └── report/page.tsx       # Per-cluster AI report summaries
└── api/
    ├── auth/[...nextauth]/   # NextAuth handler
    ├── features/             # GET (paginated, filterable) + PATCH
    ├── import/               # POST: bulk feature creation
    ├── clusters/             # GET/POST/PATCH/DELETE
    ├── clusters/auto/        # POST: OpenAI clustering (≤500 unassigned features)
    ├── clusters/merge/       # POST: move all features from source → target cluster
    ├── dimensions/           # GET/POST/PATCH/DELETE
    └── report/               # POST: generate AI summary for a cluster
```

### Key Conventions
- Every API route starts with a `getServerSession` check and returns 401 if unauthenticated
- `src/lib/auth.ts` exports `authOptions` — the single source of NextAuth config
- `src/lib/db.ts` exports a singleton `prisma` client (dev hot-reload safe)
- `src/lib/score.ts` contains scoring logic: `parseScores`, `serializeScores`, `computeCombinedScore`, `getMaxPossibleScore`. The `features/page.tsx` has a local copy of `computeCombinedScore` for optimistic UI updates — keep both in sync if changing the formula
- Scores in the DB are stored as JSON strings (`{ dimensionId: value }`); always use `parseScores`/`serializeScores` when reading or writing
- The `/(app)` route group layout is the auth gate for all user-facing pages; no individual page needs to re-check auth
- `features/page.tsx` applies optimistic score updates immediately and debounces the PATCH call by 500ms
