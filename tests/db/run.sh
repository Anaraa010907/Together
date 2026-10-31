#!/usr/bin/env bash
# Локал Postgres дээр migration + дүрмийн тестүүдийг бүрэн ажиллуулна.
# Хэрэглээ: PGHOST=/tmp PGPORT=54330 PGUSER=postgres tests/db/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-postgres}"
DB="together_test"

psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB" -c "create database $DB"

for f in tests/db/00_supabase_shim.sql supabase/migrations/*.sql tests/db/10_rules.sql; do
  echo "== $f"
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"
done

echo "DB tests OK"
