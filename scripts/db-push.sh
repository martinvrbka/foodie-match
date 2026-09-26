#!/usr/bin/env bash
# Applies new migrations in supabase/migrations/ to the cloud project from .env.
# Needs in .env: EXPO_PUBLIC_SUPABASE_URL, SUPABASE_ACCESS_TOKEN (dashboard → Account →
# Access Tokens) and SUPABASE_DB_PASSWORD (Project Settings → Database).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
: "${SUPABASE_ACCESS_TOKEN:?Add SUPABASE_ACCESS_TOKEN to .env}"
: "${SUPABASE_DB_PASSWORD:?Add SUPABASE_DB_PASSWORD to .env}"
ref=$(sed -E 's#^https://([^.]+)\..*#\1#' <<<"$EXPO_PUBLIC_SUPABASE_URL")
npx supabase link --project-ref "$ref"
npx supabase db push
