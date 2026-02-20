# Setup Guide for Team Members

## Quick Start (5 minutes)

### Prerequisites
- Node.js 18+ installed
- PostgreSQL database (local or remote)
- Git

### Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/tibi-iorga/orbit.git
   cd orbit/app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add:
   ```env
   DATABASE_URL=postgresql://user:password@host:port/database?schema=public
   NEXTAUTH_SECRET=<ask team lead for this>
   NEXTAUTH_URL=http://localhost:3000
   OPENAI_API_KEY=<optional>
   ```

4. **Set up database**
   ```bash
   npx prisma db push
   npm run db:seed
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

6. **Open browser**
   - Go to http://localhost:3000
   - Login: `admin@example.com` / `changeme`

## Local PostgreSQL Setup

### Option 1: Docker (Easiest)

```bash
docker run --name orbit-postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=orbit \
  -p 5432:5432 \
  -d postgres:15

# Use in .env:
# DATABASE_URL=postgresql://postgres:password@localhost:5432/orbit?schema=public
```

### Option 2: Homebrew (macOS)

```bash
brew install postgresql@15
brew services start postgresql@15
createdb orbit

# Use in .env:
# DATABASE_URL=postgresql://$(whoami)@localhost:5432/orbit?schema=public
```

### Option 3: Shared Development Database

Ask your team lead for the shared development database connection string.

## Common Issues

### "Prisma Client not generated"
```bash
npm run db:generate
```

### "Database connection failed"
- Verify PostgreSQL is running
- Check `DATABASE_URL` is correct
- Ensure database exists: `createdb orbit` (if local)

### "Port 3000 already in use"
```bash
# Kill process on port 3000 or use different port
PORT=3001 npm run dev
```

## Getting Help

- Check [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment details
- Check [README.md](./README.md) for more information
- Ask team lead for database credentials or NEXTAUTH_SECRET
