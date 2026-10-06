#!/bin/zsh
# Run the SQL tests. Each file gets a fresh database (reset.sh).
#   supabase/tests/sql/run.sh               all t*.sql and rls_*.sql files
#   supabase/tests/sql/run.sh t0012.sql     one file
# Prints FAIL lines and a total per file. Exit code 1 when any check fails.
set -uo pipefail
PGBIN=${PGBIN:-/opt/homebrew/opt/postgresql@18/bin}
PORT=${KDP_PG_PORT:-55432}
HERE=${0:A:h}
files=("$@"); (( $# )) || files=("$HERE"/t*.sql(N:t) "$HERE"/rls_*.sql(N:t))
pass=0; fail=0
for f in $files; do
  "$HERE/reset.sh" || exit 1
  out=$("$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -d kdp -v ON_ERROR_STOP=1 -q -X -At -f "$HERE/${f:t}" 2>&1)
  rc=$?
  p=$(print -r -- "$out" | grep -c '^PASS ')
  n=$(print -r -- "$out" | grep -c '^FAIL ')
  print -r -- "$out" | grep -E '^FAIL |ERROR' || true
  (( rc != 0 )) && { echo "${f:t}: stopped on an error"; n=$((n + 1)); }
  printf '%-22s %3d pass  %d fail\n' "${f:t}" "$p" "$n"
  pass=$((pass + p)); fail=$((fail + n))
done
printf 'total: %d pass, %d fail\n' "$pass" "$fail"
(( fail == 0 ))
