# Orbit

Web app for product managers to score feature requests by technical effort and change management cost.

## Quick Start

```bash
cd app
npm install
cp .env.example .env
# Edit .env and add DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL
npx prisma db push
npm run db:seed
npm run dev
```

Default login: `admin@example.com` / `changeme`

## Setup

### 1. Install Dependencies

```bash
cd app
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and set:

- **DATABASE_URL**: PostgreSQL connection string
  - Local: `postgresql://user:password@localhost:5432/orbit?schema=public`
  - Vercel: Auto-provided when using Vercel Postgres
- **NEXTAUTH_SECRET**: Generate with `openssl rand -base64 32`
- **NEXTAUTH_URL**: `http://localhost:3000` (local) or your deployment URL
- **OPENAI_API_KEY**: Optional, for auto-cluster and report features

### 3. Set Up Database

**Local PostgreSQL:**
```bash
# Using Docker
docker run --name orbit-postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=orbit \
  -p 5432:5432 -d postgres:15

# Then in .env:
# DATABASE_URL=postgresql://postgres:password@localhost:5432/orbit?schema=public
```

**Apply Schema:**
```bash
npx prisma db push
npm run db:seed
```

### 4. Run Development Server

```bash
npm run dev
```

Visit http://localhost:3000 and login with `admin@example.com` / `changeme`

## Stack

Next.js 14 (App Router), TypeScript, Tailwind CSS, Prisma (PostgreSQL), NextAuth (credentials), OpenAI for clustering and report text.

## Documentation

- **[SETUP.md](./SETUP.md)** - Quick setup guide for team members
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Detailed Vercel deployment instructions

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed Vercel deployment instructions.

**Quick deploy:**
1. Connect GitHub repo to Vercel
2. Set root directory to `app`
3. Add Vercel Postgres database
4. Set environment variables (DATABASE_URL auto-added, add NEXTAUTH_SECRET, NEXTAUTH_URL)
5. Deploy and run `npx prisma db push && npm run db:seed` via Vercel CLI

## Performance

Optimized to handle 500+ feature requests efficiently with:
- Server-side pagination (50 items per page)
- Database indexes for fast queries
- Optimistic UI updates with debounced API calls
- Batch processing for imports

## Screens

- **Login**: Email and password only.
- **Import**: Upload CSV, map columns to title and description. Supports multiple imports; new items start unassigned.
- **Feature list**: Table with cluster filter, dimension scores (toggles/buttons), combined score. Expand row for breakdown. Auto-cluster button and review (rename, merge, move items).
- **Settings**: Edit scoring dimensions (name, type yes/no or 1–3 scale, weight). Defaults match a healthcare change management framework.
- **Report**: One block per cluster with top items and AI-generated summary; copy to clipboard.
