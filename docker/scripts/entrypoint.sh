#!/bin/sh
set -e

echo "==> Running database migrations..."
node apps/api/dist/scripts/migrate-control-plane.js

echo "==> Starting API server..."
exec node apps/api/dist/main.js
