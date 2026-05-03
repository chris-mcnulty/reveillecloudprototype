#!/bin/bash
# Post-merge setup: runs automatically after a task agent's work is merged
# into main. Keeps the dev environment in sync with merged code.
set -e

echo "[post-merge] Installing npm dependencies..."
npm install --no-audit --no-fund --prefer-offline

echo "[post-merge] Pushing Drizzle schema to database..."
# --force so additive schema changes (the only kind tasks produce) apply
# without prompting; --prefer-offline above keeps install fast on warm cache.
npm run db:push -- --force

echo "[post-merge] Done."
