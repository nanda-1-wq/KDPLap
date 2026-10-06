#!/bin/zsh
# psql on the test database (after reset.sh). Example: supabase/tests/sql/psql.sh -c "select 1"
exec ${PGBIN:-/opt/homebrew/opt/postgresql@18/bin}/psql -h 127.0.0.1 -p ${KDP_PG_PORT:-55432} -U postgres -d kdp -X "$@"
