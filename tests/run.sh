#!/usr/bin/env bash
# One command for the whole test run: fresh local database, SQL files, synthetic
# test data, unit tests and the mobile end-to-end test against tests/mock-server.js.
#   npm test
# Uses the normal PG* environment variables (PGHOST, PGUSER, PGPASSWORD, PGPORT)
# and refuses anything but a local Postgres: the tests must never touch production.
set -euo pipefail
cd "$(dirname "$0")/.."

case "${PGHOST:-localhost}" in
  localhost|127.0.0.1|::1|/*) ;;
  *) echo "PGHOST=$PGHOST is not local. Refusing to run the tests." >&2; exit 1 ;;
esac

DB=drinkrate_test
export PGOPTIONS="-c client_min_messages=warning"
OUT=tests/.out
PORT=${PORT:-8787}
rm -rf "$OUT" && mkdir -p "$OUT/screens"

echo "── Database"
psql -q -v ON_ERROR_STOP=1 -d postgres <<SQL
drop database if exists $DB;
create database $DB;
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end \$\$;
SQL
export PGDATABASE=$DB
for f in supabase/setup.sql supabase/photos.sql supabase/stickers.sql supabase/security_holiday.sql tests/seed.sql tests/sql-checks.sql; do
  echo "   $f"
  psql -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done

echo "── Unit tests"
node --test tests/unit/*.test.js

echo "── End-to-end"
node tests/make-photo.js "$OUT/test-photo.jpg"
PORT=$PORT node tests/mock-server.js > "$OUT/mock.log" 2>&1 &
MOCK=$!
trap 'kill $MOCK 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do
  curl -sf "http://localhost:$PORT/" >/dev/null && break
  sleep 0.2
done
PORT=$PORT TEST_PHOTO="$OUT/test-photo.jpg" node tests/e2e.js "$OUT/screens"
