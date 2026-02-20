# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Orbit** — a product feedback management tool for healthcare teams. Users import CSV feature requests, organize them by product, cluster them into themes (manually or via AI), score each feature against configurable dimensions, and generate AI report summaries per cluster.

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
# Edit .env: Add DATABASE_URL, DIRECT_URL, NEXTAUTH_SECRET, NEXTAUTH_URL, OPENAI_API_KEY
npm run db:push          # Creates database schema
npm run db:seed          # Creates admin@example.com / changeme
npm run dev
```

## Environment Variables

| Variable | Purpose | Required |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string (pooled, e.g. Supabase pooler) | Yes |
| `DIRECT_URL` | Direct (non-pooled) PostgreSQL URL for migrations | Yes |
| `NEXTAUTH_SECRET` | JWT signing key — generate with `openssl rand -base64 32` | Yes |
| `NEXTAUTH_URL` | App origin, e.g. `http://localhost:3000` or production URL | Yes |
| `OPENAI_API_KEY` | Used by auto-cluster and report summary routes (gpt-4o-mini) | No |

> In `prisma/schema.prisma`, `DATABASE_URL` is the pooled URL and `DATABASE_POSTGRES_URL_NON_POOLING` is the direct URL (mapped via `directUrl`). The `.env.example` calls this `DIRECT_URL` — ensure your local `.env` uses the name the schema expects.

## Architecture

### Tech Stack
Next.js 14 (App Router), TypeScript, Tailwind CSS, Prisma with PostgreSQL, NextAuth v4 (credentials/JWT), OpenAI SDK, PapaParse, Headless UI.

### Data Model (`prisma/schema.prisma`)
- **User** — email + bcrypt password hash
- **Product** — hierarchical via self-referential `parentId`; cascade deletes children; has `name`, `description`, `parentId`
- **ImportRecord** — one record per CSV upload; optionally linked to a Product; parent to Features
- **FeedbackItem** — a single feedback item; has `status` (`new` | `reviewed` | `rejected`); optionally linked to an Opportunity and a Product. Status `reviewed` requires an opportunity. Removing an opportunity from a reviewed item auto-reverts status to `new`
- **Cluster** — a named group of Features; holds optional AI-generated `reportSummary`
- **Dimension** — a scoring axis (`yesno` or `scale` 1–3) with a weight and display order

### Routing Structure
```
src/app/
├── page.tsx                        # Redirect: → /feedback or /login
├── layout.tsx                      # Root layout with SessionProvider
├── (app)/                          # Route group — auth-guarded via layout.tsx
│   ├── layout.tsx                  # Server component: checks session, wraps AppLayout
│   ├── feedback/
│   │   ├── page.tsx                # All feedback (no product filter)
│   │   └── [...slug]/page.tsx      # Feedback filtered by product slug path
│   ├── import/page.tsx             # CSV upload and column mapping
│   ├── imports/page.tsx            # Import history
│   └── settings/
│       ├── evaluation-criteria/    # Dimension CRUD
│       └── products/               # Product CRUD (hierarchical)
└── api/
    ├── auth/[...nextauth]/         # NextAuth handler
    ├── features/                   # GET (paginated, filterable) + PATCH
    ├── imports/                    # POST: bulk feature creation
    ├── clusters/                   # GET/POST/PATCH/DELETE
    ├── clusters/auto/              # POST: OpenAI clustering (≤500 unassigned features)
    ├── clusters/merge/             # POST: move all features from source → target cluster
    ├── dimensions/                 # GET/POST/PATCH/DELETE
    ├── products/                   # GET/POST/PATCH/DELETE (returns { flat, tree })
    └── report/                     # POST: generate AI summary for a cluster
```

### Key Components
- `AppLayout` — wraps all app pages; manages mobile sidebar state and the global `ImportModal`
- `Sidebar` — client component rendering the product tree (via `Disclosure` from Headless UI), main nav links, sign-out, and a badge showing count of `new` feedback items
- `FeedbackDetailPanel` — slide-over panel for viewing/editing a single feedback item; supports assigning product/opportunity, marking reviewed (gated on opportunity), rejecting (with confirmation), and restoring

### Key Conventions
- Every API route starts with a `getServerSession` check and returns 401 if unauthenticated
- `src/lib/auth.ts` exports `authOptions` — the single source of NextAuth config
- `src/lib/db.ts` exports a singleton `prisma` client (dev hot-reload safe)
- `src/lib/score.ts` contains scoring logic: `parseScores`, `serializeScores`, `computeCombinedScore`, `getMaxPossibleScore`. `FeedbackPageContent` has a local copy of `computeCombinedScore` (`computeCombinedScoreLocal`) for optimistic UI updates — keep both in sync if changing the formula
- `src/lib/product-slug.ts` provides three utilities: `productNameToSlug` (name → URL slug), `buildProductPath` (product → slug array for the full hierarchy path), `findProductByPath` (slug array → product node)
- Scores in the DB are stored as JSON strings (`{ dimensionId: value }`); always use `parseScores`/`serializeScores` when reading or writing
- The `/(app)` route group layout is the auth gate for all user-facing pages
- `GET /api/products` returns `{ flat: ProductWithCounts[], tree: ProductNode[] }`. Use `flat` for lookups/dropdowns and `tree` for hierarchical rendering. The Sidebar receives `flat` as `allProducts` to `ProductNode` components for path building
- Product URLs follow the hierarchy: `/feedback/parent-slug/child-slug`. The `[...slug]` route resolves slugs to a product ID by fetching `/api/products` and calling `findProductByPath`
- Products cannot be deleted if they have child products (enforced in the API). Deleting a product sets its features' `productId` to null (`onDelete: SetNull`)
