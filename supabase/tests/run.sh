#!/usr/bin/env bash
# Bank-sync safety checks against the LOCAL stack only.
# Usage: supabase/tests/run.sh            (static checks + SQL checks)
# Needs: local stack up and new migrations applied (`supabase migration up --local`).
# Uses psql when installed, else psql inside the local db container.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *127.0.0.1*|*localhost*) ;;
  *) echo "refusing: DB_URL is not local"; exit 2 ;;
esac

if command -v psql >/dev/null 2>&1; then
  PSQL=(psql "$DB_URL")
else
  PSQL=(docker exec -i "${DB_CONTAINER:-supabase_db_cash-flow-bank}" psql -U postgres)
fi

pass=0
fail=0
ok() { echo "PASS $1"; pass=$((pass + 1)); }
bad() { echo "FAIL $1"; fail=$((fail + 1)); }

# --- static: new migrations are additive -------------------------------------------------
MIG="$ROOT/supabase/migrations"
NEW=$(ls "$MIG"/2026112*.sql 2>/dev/null || true)
if [ -z "$NEW" ]; then bad "static: new migrations present"; fi
for f in $NEW; do
  name=$(basename "$f")
  body=$(sed -e 's/--.*$//' "$f" | tr '[:upper:]' '[:lower:]')
  # "drop constraint/policy if exists X" is allowed only when the same file re-creates X (idempotent re-run)
  drops=$(echo "$body" | grep -Eo 'drop[[:space:]]+(table|column|schema|type|view|constraint|policy|index|function|trigger)[[:space:]]+(if[[:space:]]+exists[[:space:]]+)?[a-z0-9_."]+' || true)
  bad_drop=""
  while IFS= read -r d; do
    [ -z "$d" ] && continue
    what=$(echo "$d" | awk '{print $2}'); obj=$(echo "$d" | awk '{print $NF}')
    case "$what" in
      constraint|policy|trigger) echo "$body" | grep -Eq "(add[[:space:]]+constraint|create[[:space:]]+policy|create[[:space:]]+trigger)[[:space:]]+$obj\b" || bad_drop="$bad_drop $what:$obj" ;;
      *) bad_drop="$bad_drop $what:$obj" ;;
    esac
  done <<< "$drops"
  [ -n "$bad_drop" ] && bad "static: $name destructive drop:$bad_drop" || ok "static: $name no destructive drop"
  echo "$body" | grep -Eq '\b(delete[[:space:]]+from|truncate)\b' && bad "static: $name deletes/truncates" || ok "static: $name no delete/truncate"
  echo "$body" | grep -Eq 'alter[[:space:]]+column[^;]*[[:space:]]type\b' && bad "static: $name alters a column type" || ok "static: $name no column type change"
  echo "$body" | grep -Eq '\brename\b' && bad "static: $name renames" || ok "static: $name no rename"
  # only transaction_splits/paybacks may cascade, and only from transactions
  cas=$(echo "$body" | grep -Eo 'references[[:space:]]+(public\.)?[a-z_]+[^,;]*on[[:space:]]+delete[[:space:]]+cascade' | grep -Ev 'references[[:space:]]+(public\.)?transactions|references[[:space:]]+auth\.users|references[[:space:]]+(public\.)?bank_(connections|accounts)' || true)
  [ -n "$cas" ] && bad "static: $name unexpected cascade: $cas" || ok "static: $name cascades limited"
  echo "$body" | grep -Eiq "'(eyj[a-z0-9_-]{10,}|sb_secret_[a-z0-9_-]+|[a-z0-9+/=_-]{40,})'" && bad "static: $name looks like a literal secret" || ok "static: $name no literal secret"
done

CFG="$ROOT/supabase/config.toml"
if grep -A2 '^\[functions.bank-sync\]' "$CFG" | grep -q 'verify_jwt *= *true'; then ok "config: bank-sync verify_jwt = true"; else bad "config: bank-sync verify_jwt = true"; fi

# --- SQL checks --------------------------------------------------------------------------
OUT=$("${PSQL[@]}" -v ON_ERROR_STOP=0 -At -f - < "$ROOT/supabase/tests/checks.sql" 2>&1)
while IFS= read -r line; do
  case "$line" in
    PASS*) echo "$line"; pass=$((pass + 1)) ;;
    FAIL*) echo "$line"; fail=$((fail + 1)) ;;
    *ERROR*) echo "SQL $line"; fail=$((fail + 1)) ;;
  esac
done <<< "$OUT"

echo "---"
echo "pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
