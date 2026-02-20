#!/bin/bash
# Database setup script for Orbit
# Usage: ./scripts/setup-db.sh

set -e

echo "🚀 Setting up Orbit database..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable is not set"
    echo "Please set it in your .env file or export it:"
    echo "  export DATABASE_URL='postgresql://user:password@host:port/database?schema=public'"
    exit 1
fi

echo "✓ DATABASE_URL is set"

# Generate Prisma client
echo "📦 Generating Prisma client..."
npx prisma generate

# Push schema to database
echo "🗄️  Pushing schema to database..."
npx prisma db push --accept-data-loss

# Seed database
echo "🌱 Seeding database..."
npm run db:seed

echo "✅ Database setup complete!"
echo ""
echo "Default login credentials:"
echo "  Email: admin@example.com"
echo "  Password: changeme"
echo ""
echo "Start the dev server with: npm run dev"
