# Deployment Guide

This guide covers deploying Orbit to Vercel with PostgreSQL. For local development setup, see [SETUP.md](./SETUP.md).

## Vercel Deployment

### Prerequisites

1. GitHub repository: https://github.com/tibi-iorga/orbit
2. Vercel account (free tier works)
3. PostgreSQL database (Vercel Postgres recommended)

### Step 1: Set Up Database

#### Option A: Vercel Postgres (Recommended)

1. In your Vercel project dashboard, go to **Storage** tab
2. Click **Create Database** → Select **Postgres**
3. Choose a name (e.g., "orbit-db")
4. Select a region closest to your users
5. Click **Create**
6. The `DATABASE_URL` environment variable will be automatically added

#### Option B: External PostgreSQL (Supabase, Neon, Railway)

1. Create a PostgreSQL database
2. Get the connection string (format: `postgresql://user:password@host:port/database?sslmode=require`)
3. You'll add this as `DATABASE_URL` in Step 3

### Step 2: Deploy to Vercel

1. Go to https://vercel.com/new
2. Import your GitHub repository: `tibi-iorga/orbit`
3. Configure project:
   - **Root Directory**: `app`
   - **Framework Preset**: Next.js (auto-detected)
   - **Build Command**: `npm run build` (default)
   - **Output Directory**: `.next` (default)
   - **Install Command**: `npm install` (default)

### Step 3: Set Environment Variables

In Vercel project settings → **Environment Variables**, add:

#### Required

1. **DATABASE_URL**
   - If using Vercel Postgres: Already set automatically
   - If using external DB: `postgresql://user:password@host:port/database?sslmode=require`

2. **NEXTAUTH_SECRET**
   - Generate: `openssl rand -base64 32`
   - Or use Vercel's generate option
   - Required for: Production, Preview, Development

3. **NEXTAUTH_URL**
   - Production: `https://your-app-name.vercel.app` (update after first deploy)
   - Preview: Leave empty (Vercel auto-sets)
   - Development: `http://localhost:3000`

#### Optional

4. **OPENAI_API_KEY**
   - Your OpenAI API key
   - Required for: Auto-cluster and report summary features
   - If not set, those features will show errors

### Step 4: Initialize Database

After first deployment, you need to create the database schema and seed initial data.

**Recommended: Via Vercel CLI**

```bash
# Install Vercel CLI
npm i -g vercel

# Link to your project (run from project root)
vercel link

# Pull environment variables
vercel env pull .env.local

# Set up database schema
cd app
npx prisma db push

# Seed database (creates admin user and default dimensions)
npm run db:seed
```

**Alternative: Direct Database Connection**

If you have direct access to your PostgreSQL database:

```bash
cd app

# Set DATABASE_URL environment variable
export DATABASE_URL="your-production-database-url"

# Or add to .env.local and source it
source .env.local

# Push schema
npx prisma db push

# Seed data
npm run db:seed
```

**Note**: For production, consider using migrations instead:
```bash
npx prisma migrate dev --name initial_schema
npx prisma migrate deploy  # In production
```

### Step 5: Verify Deployment

1. Visit your Vercel URL: `https://your-app-name.vercel.app`
2. Login with: `admin@example.com` / `changeme`
3. Test key features:
   - Create a product
   - Import a CSV
   - Score features
   - Generate clusters

## Local Development Setup

### Quick Start

```bash
cd app

# Install dependencies
npm install

# Set up environment
cp .env.example .env

# Edit .env and add:
# DATABASE_URL=postgresql://user:password@localhost:5432/orbit?schema=public
# NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>
# NEXTAUTH_URL=http://localhost:3000
# OPENAI_API_KEY=<your-key> (optional)

# Set up database
npx prisma db push
npm run db:seed

# Start dev server
npm run dev
```

### Local PostgreSQL Setup

#### Using Docker (Easiest)

```bash
docker run --name orbit-postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=orbit \
  -p 5432:5432 \
  -d postgres:15

# Then use: postgresql://postgres:password@localhost:5432/orbit?schema=public
```

#### Using Homebrew (macOS)

```bash
brew install postgresql@15
brew services start postgresql@15
createdb orbit
# Use: postgresql://$(whoami)@localhost:5432/orbit?schema=public
```

#### Using Supabase Local (Alternative)

```bash
npx supabase init
npx supabase start
# Use the connection string provided
```

## Database Migrations

### Development (using db:push)

```bash
cd app
npx prisma db push
```

This applies schema changes directly without migration files. Good for rapid development.

### Production (using migrations)

```bash
cd app

# Create a migration
npx prisma migrate dev --name add_product_hierarchy

# Deploy to production
npx prisma migrate deploy
```

## Adding Team Members

### Create Users

Users must be added directly to the database. Options:

1. **Via Prisma Studio** (local):
   ```bash
   cd app
   npx prisma studio
   # Navigate to User model, click "Add record"
   ```

2. **Via SQL**:
   ```sql
   INSERT INTO "User" (id, email, "passwordHash", "createdAt")
   VALUES (
     'cuid-here',
     'user@example.com',
     '$2a$10$hashedpassword', -- Use bcrypt.hash('password', 10)
     NOW()
   );
   ```

3. **Via Seed Script** (add to `prisma/seed.ts`):
   ```typescript
   const hash = await bcrypt.hash("password", 10);
   await prisma.user.create({
     data: { email: "user@example.com", passwordHash: hash },
   });
   ```

## Troubleshooting

### Build Fails: "Prisma Client not generated"

- Ensure `postinstall` script runs: Check Vercel build logs
- Verify `@prisma/client` is in `dependencies` (not `devDependencies`)

### Database Connection Errors

- Verify `DATABASE_URL` is set correctly in Vercel
- Check database is accessible (not behind firewall)
- Ensure SSL is enabled: Add `?sslmode=require` to connection string
- For Vercel Postgres: Connection string is auto-provided

### NextAuth Errors

- Verify `NEXTAUTH_SECRET` is set (32+ character string)
- Check `NEXTAUTH_URL` matches your deployment URL exactly
- Ensure database has User table and is seeded

### Migration Errors

- Run `npx prisma migrate reset` (local only, deletes data)
- Or `npx prisma db push` to sync schema without migrations
- Check Prisma schema is valid: `npx prisma validate`

## Environment-Specific Notes

### Production
- Use `prisma migrate deploy` for schema changes
- Never run `db:push` in production
- Always backup database before migrations
- Use connection pooling (handled by Prisma)

### Development
- `db:push` is fine for rapid iteration
- Use local PostgreSQL or Docker
- Seed script is idempotent (safe to run multiple times)

### Preview (Vercel)
- Each preview gets its own database (if using Vercel Postgres)
- Or share staging database via `DATABASE_URL`
- Seed data may be needed for each preview

## Security Checklist

- [ ] `DATABASE_URL` is set in Vercel (never commit to git)
- [ ] `NEXTAUTH_SECRET` is strong and unique
- [ ] `NEXTAUTH_URL` matches deployment URL
- [ ] Database has SSL enabled
- [ ] No secrets in code or commit history
- [ ] `.env` files in `.gitignore`
- [ ] Database backups configured (if production)
