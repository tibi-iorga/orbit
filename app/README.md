# Orbit

Web app for product managers to score feature requests by technical effort and change management cost. Built from `planning/context.md`.

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and set:
   - `NEXTAUTH_SECRET`: e.g. `openssl rand -base64 32`
   - `NEXTAUTH_URL`: e.g. `http://localhost:3000`
   - `OPENAI_API_KEY`: for Auto-cluster and report summary (optional; those features return an error if unset)
3. Create DB and seed: `npx prisma db push` then `npx tsx prisma/seed.ts`
4. Run: `npm run dev`

Default login after seed: `admin@example.com` / `changeme`. Add more users by inserting into the database (no public signup).

## Stack

Next.js 14 (App Router), TypeScript, Tailwind CSS, Prisma (SQLite), NextAuth (credentials), OpenAI for clustering and report text.

## Performance

Optimized to handle 500+ feature requests efficiently with:
- Server-side pagination (50 items per page)
- Database indexes for fast queries
- Optimistic UI updates with debounced API calls
- Batch processing for imports
- See `PERFORMANCE.md` for details

## Screens

- **Login**: Email and password only.
- **Import**: Upload CSV, map columns to title and description. Supports multiple imports; new items start unassigned.
- **Feature list**: Table with cluster filter, dimension scores (toggles/buttons), combined score. Expand row for breakdown. Auto-cluster button and review (rename, merge, move items).
- **Settings**: Edit scoring dimensions (name, type yes/no or 1–3 scale, weight). Defaults match a healthcare change management framework.
- **Report**: One block per cluster with top items and AI-generated summary; copy to clipboard.
