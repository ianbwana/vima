#!/bin/sh
set -e

echo "==> Running database migrations..."
cd /app/apps/api
npx drizzle-kit migrate
cd /app

echo "==> Starting API server..."
exec node apps/api/dist/main.js
