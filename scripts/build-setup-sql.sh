#!/usr/bin/env bash
# Rebuilds docs/test-site/setup-database.sql: every migration in supabase/migrations, in order, as one file
# to paste into a NEW EMPTY Supabase project. Run it whenever a migration is added.
set -euo pipefail
cd "$(dirname "$0")/.."
out=docs/test-site/setup-database.sql
last=$(ls supabase/migrations/*.sql | tail -1 | xargs basename)
{
  echo "-- Givezy: all database setup steps in order, for a NEW EMPTY test project only."
  echo "-- Built by scripts/build-setup-sql.sh from supabase/migrations, up to and including ${last}."
  echo "-- An existing project runs only the sections it does not have yet, in order."
  for f in supabase/migrations/*.sql; do
    echo
    echo "-- ===== $(basename "$f") ====="
    cat "$f"
  done
} > "$out"
echo "Wrote $out (up to $last)."
