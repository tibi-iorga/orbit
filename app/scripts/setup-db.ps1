# Database setup script for Orbit (PowerShell)
# Usage: .\scripts\setup-db.ps1

$ErrorActionPreference = "Stop"

Write-Host "🚀 Setting up Orbit database..." -ForegroundColor Cyan

# Check if DATABASE_URL is set
if (-not $env:DATABASE_URL) {
    Write-Host "❌ ERROR: DATABASE_URL environment variable is not set" -ForegroundColor Red
    Write-Host "Please set it in your .env file or as an environment variable:"
    Write-Host "  `$env:DATABASE_URL='postgresql://user:password@host:port/database?schema=public'"
    exit 1
}

Write-Host "✓ DATABASE_URL is set" -ForegroundColor Green

# Generate Prisma client
Write-Host "📦 Generating Prisma client..." -ForegroundColor Cyan
npx prisma generate

# Push schema to database
Write-Host "🗄️  Pushing schema to database..." -ForegroundColor Cyan
npx prisma db push --accept-data-loss

# Seed database
Write-Host "🌱 Seeding database..." -ForegroundColor Cyan
npm run db:seed

Write-Host "✅ Database setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Default login credentials:"
Write-Host "  Email: admin@example.com"
Write-Host "  Password: changeme"
Write-Host ""
Write-Host "Start the dev server with: npm run dev"
