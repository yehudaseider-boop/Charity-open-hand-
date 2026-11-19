#!/usr/bin/env bash
# Rebuilds the phone app's browser preview into public/app-preview/app (shown on the test site at /app-preview,
# inside an iPhone-shaped frame). Sample data only: no database keys are set for this build, on purpose.
# Run from the repo root after changing the app:  bash scripts/build-app-preview.sh
set -euo pipefail
cd "$(dirname "$0")/../apps/mobile"
OUT="$(cd ../.. && pwd)/public/app-preview/app"
rm -rf "$OUT"
env -u EXPO_PUBLIC_SUPABASE_URL -u EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY -u EXPO_PUBLIC_SITE_URL \
  EXPO_WEB_BASE_URL=/app-preview/app npx expo export --platform web --output-dir "$OUT"
echo "Built $OUT"
