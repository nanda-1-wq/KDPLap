#!/bin/zsh
# Fresh database for the SQL tests: a throwaway Postgres 18 cluster on
# 127.0.0.1:55432 (TCP only), a new "kdp" database, stub.sql, then every
# migration in order. Never uses port 5432 (the owner's own Postgres).
#   supabase/tests/sql/reset.sh          reset (starts the cluster if needed)
#   supabase/tests/sql/reset.sh stop     stop the cluster
set -euo pipefail
PGBIN=${PGBIN:-/opt/homebrew/opt/postgresql@18/bin}
PORT=${KDP_PG_PORT:-55432}
DATA=${KDP_PG_DATA:-${TMPDIR:-/tmp}/kdplab-pg}
HERE=${0:A:h}
ROOT=${HERE:h:h:h}
[[ $PORT == 5432 ]] && { echo "reset.sh: refusing port 5432"; exit 1; }

if [[ ${1:-} == stop ]]; then
  "$PGBIN/pg_ctl" -D "$DATA" stop -m fast >/dev/null 2>&1 || true
  exit 0
fi

if ! "$PGBIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1; then
  if [[ ! -f $DATA/PG_VERSION ]]; then
    "$PGBIN/initdb" -D "$DATA" -U postgres -A trust -E UTF8 --no-locale >/dev/null
  fi
  # -k '': no Unix socket (the temp path is too long for one).
  "$PGBIN/pg_ctl" -D "$DATA" -l "$DATA/server.log" -w \
    -o "-p $PORT -k '' -c listen_addresses=127.0.0.1" start >/dev/null
fi

export PGOPTIONS="-c client_min_messages=warning"
PSQL=("$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -d postgres -c "drop database if exists kdp with (force)" -c "create database kdp" >/dev/null
"${PSQL[@]}" -d kdp -f "$HERE/stub.sql" >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do
  "${PSQL[@]}" -d kdp -f "$f" >/dev/null || { echo "reset.sh: failed on ${f:t}"; exit 1; }
done
