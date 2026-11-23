#!/bin/zsh
# E16.2 race proof for 0032 (plan v2, Part 1). Runs ONLY on the scratch cluster 127.0.0.1:55432
# (reset.sh builds a fresh "kdp" database there; never the owner's Postgres, never the live DB).
# Do not run it at the same time as run.sh: both reset the same database.
#
# Each round starts N psql sessions at once. They connect, then wait on a gate (a session-level
# advisory lock held by one more session). The gate opens only when all N are waiting, so every
# worker calls at the same moment. Each round is checked:
#   S1  20 sessions as A: stock_reserve('pixabay', 'pick', 1)      → exactly 10 ok and 10 rows
#   S2  30 as A + 30 as B: stock_reserve('unsplash', 'search', 1)   → 45 ok in all, A ≤ 30, B ≤ 30,
#                                                                     45 Unsplash calls in the rows
#   S3  2 sessions as A: a My layouts export of a book that has 5  → both saved, exactly 5 after
#   S4  retired with 0033 (E16.3, owner Q3): it raced 40 direct inserts as A into stock_calls (the
#       v1 path). Since 0033 a user has no insert right, so every one is refused before the guard,
#       and the race it proved cannot happen through the API. S1 and S2 prove the same locks
#       through stock_reserve; t0032 §4b and t0033 §6 prove the guard's caps for the inserts that
#       remain (the table owner, the service role).
#   C   the control: 20 sessions as A call a test-only naive function (count, pg_sleep(0.05),
#       insert; created here, in the scratch database only, never in a migration). It must let
#       more than 10 through in at least one round, which shows the harness can see a race.
#       Since 0033 it is a security definer (as stock_reserve), because a user can no longer
#       insert into stock_calls directly.
#   C3  the control for S3: the same 2 exports after the guard is swapped (in the scratch database
#       only, at the very end) for a copy of 0032's trim without its advisory lock and with
#       pg_sleep(0.05). It must end with 6 entries at least once, which shows S3 can see a race.
#   C4  retired with S4 (0033, Q3): it was S4's control.
#   supabase/tests/sql/race_0032.sh            10 rounds of each
#   ROUNDS=3 supabase/tests/sql/race_0032.sh   fewer rounds
#   KEEP=1 supabase/tests/sql/race_0032.sh     keep the worker outputs (the path is printed)
set -uo pipefail
PGBIN=${PGBIN:-/opt/homebrew/opt/postgresql@18/bin}
HOST=127.0.0.1
PORT=55432
[[ -n ${KDP_PG_PORT:-} && ${KDP_PG_PORT} != 55432 ]] && { echo "race_0032.sh: the scratch cluster on 55432 only"; exit 1; }
HERE=${0:A:h}
ROUNDS=${ROUNDS:-10}
A=00000000-0000-4000-8000-00000000000a
B=00000000-0000-4000-8000-00000000000b
BOOK1=b0000000-0000-4000-8000-000000000001
GATE=7700

KDP_PG_PORT=$PORT KDP_PG_NO_FN_DEFAULTS= "$HERE/reset.sh" || exit 1
export PGOPTIONS="-c client_min_messages=warning"
PSQL=("$PGBIN/psql" -h $HOST -p $PORT -U postgres -d kdp -X -q -At -v ON_ERROR_STOP=1)
TMP=$(mktemp -d "${TMPDIR:-/tmp}/race0032.XXXXXX")
[[ ${KEEP:-} == 1 ]] && print -r -- "worker outputs kept in $TMP" || trap 'rm -rf "$TMP"' EXIT
q() { "${PSQL[@]}" -c "$1"; }

q "insert into auth.users values ('$A'), ('$B');
   insert into public.books (id, user_id, title) values ('$BOOK1', '$A', 'Race book');" || exit 1
# The control: the v1 pattern (read the count, then write) in one function, with a short sleep
# between the two. Test only: this scratch database, never a migration. A definer since 0033 (no
# direct insert for authenticated); auth.uid() still reads the worker's user id.
q "create function public.race_naive_reserve() returns boolean language plpgsql security definer set search_path = '' as \$\$
   declare n int;
   begin
     select count(*) into n from public.stock_calls c
      where c.user_id = auth.uid() and c.action = 'pick' and c.at > now() - interval '1 minute';
     perform pg_sleep(0.05);
     if n >= 10 then return false; end if;
     insert into public.stock_calls (user_id, source, action, provider_calls) values (auth.uid(), 'pixabay', 'pick', 1);
     return true;
   end \$\$;
   grant execute on function public.race_naive_reserve() to authenticated;" || exit 1

# fire <dir> <user:sql>... : one session per argument, all released together by the gate.
# Prints how many workers were waiting when the gate opened.
fire() {
  local dir=$1; shift
  local n=$#
  rm -rf "$dir"; mkdir -p "$dir"
  "${PSQL[@]}" -c "do \$\$
    declare t timestamptz := clock_timestamp();
    begin
      perform pg_advisory_lock($GATE);
      while (select count(*) from pg_locks where locktype = 'advisory' and objid = $GATE and objsubid = 1 and not granted) < $n
            and clock_timestamp() < t + interval '20 seconds' loop
        perform pg_sleep(0.01);
      end loop;
    end \$\$" \
    -c "select count(*) from pg_locks where locktype = 'advisory' and objid = $GATE and objsubid = 1 and not granted" > "$dir/gate.txt" 2>&1 &
  local gate=$!
  sleep 0.2
  local i=0 pids=() arg user sql
  for arg in "$@"; do
    i=$((i + 1)); user=${arg%%:*}; sql=${arg#*:}
    "${PSQL[@]}" -c "select pg_advisory_lock_shared($GATE)" -c "set role authenticated" \
      -c "set request.jwt.claim.sub = '$user'" -c "$sql" > "$dir/w$i.txt" 2>&1 &
    pids+=($!)
  done
  wait $gate
  local p; for p in $pids; do wait $p; done
  print -r -- "$(tail -n 1 "$dir/gate.txt")"
}
# count <dir> <pattern> : worker outputs that contain the pattern.
count() { grep -l -- "$2" "$1"/w*.txt 2>/dev/null | wc -l | tr -d ' '; }
errors() { cat "$1"/w*.txt | grep -c 'ERROR' ; }

fail=0
report() {  # report <label> <ok?> <text>
  if [[ $2 == 1 ]]; then print -r -- "PASS $1  $3"; else print -r -- "FAIL $1  $3"; fail=$((fail + 1)); fi
}

# ── S1: 20 parallel picks as A ──
s1=()
for r in {1..$ROUNDS}; do
  q "delete from public.stock_calls" || exit 1
  args=(); for i in {1..20}; do args+=("${A}:select public.stock_reserve('pixabay', 'pick', 1::smallint)"); done
  w=$(fire "$TMP/s1" $args)
  ok=$(count "$TMP/s1" '"ok": true'); rl=$(count "$TMP/s1" '"rate_limited"'); er=$(errors "$TMP/s1")
  rows=$(q "select count(*) from public.stock_calls where user_id = '$A' and action = 'pick'")
  report "S1 round $r" $(( w == 20 && ok == 10 && rl == 10 && rows == 10 && er == 0 )) "waiting $w/20, ok $ok, rate_limited $rl, rows $rows, errors $er"
done

# ── S2: 30 Unsplash searches as A and 30 as B, at once ──
for r in {1..$ROUNDS}; do
  q "delete from public.stock_calls" || exit 1
  args=()
  for i in {1..30}; do args+=("${A}:select public.stock_reserve('unsplash', 'search', 1::smallint)"); done
  for i in {1..30}; do args+=("${B}:select public.stock_reserve('unsplash', 'search', 1::smallint)"); done
  w=$(fire "$TMP/s2" $args)
  ok=$(count "$TMP/s2" '"ok": true'); busy=$(count "$TMP/s2" '"stock_busy"'); er=$(errors "$TMP/s2")
  okA=$(q "select count(*) from public.stock_calls where user_id = '$A'")
  okB=$(q "select count(*) from public.stock_calls where user_id = '$B'")
  calls=$(q "select coalesce(sum(provider_calls), 0) from public.stock_calls where source = 'unsplash'")
  report "S2 round $r" $(( w == 60 && ok == 45 && busy == 15 && okA <= 30 && okB <= 30 && okA + okB == 45 && calls == 45 && er == 0 )) \
    "waiting $w/60, ok $ok (A $okA, B $okB), stock_busy $busy, Unsplash calls $calls, errors $er"
done

# ── S3: 2 parallel My layouts exports of a book that has 5 ──
# seed5: A's book gets 5 entries, Old 1 (newest) to Old 5 (oldest).
seed5() {
  q "delete from public.cover_my_layouts;
     set session_replication_role = replica;
     insert into public.cover_my_layouts (id, user_id, name, from_book_id, fmt, bg, layers, exported_at)
       select ('3c000000-0000-4000-8000-00000000000' || n)::uuid, '$A', 'Old ' || n, '$BOOK1',
              '{\"trim\": \"6x9\", \"pages\": 54, \"paper\": \"white\"}', '#FFFFFF', '[]', now() - n * interval '1 minute'
         from generate_series(1, 5) n;
     set session_replication_role = origin;"
}
for r in {1..$ROUNDS}; do
  seed5 || exit 1
  ins="insert into public.cover_my_layouts (name, from_book_id, fmt, bg, layers) values ('New', '$BOOK1', '{\"trim\": \"6x9\", \"pages\": 54, \"paper\": \"white\"}', '#FFFFFF', '[]') returning 'saved'"
  w=$(fire "$TMP/s3" "${A}:$ins" "${A}:$ins")
  saved=$(count "$TMP/s3" 'saved'); er=$(errors "$TMP/s3")
  left=$(q "select count(*) from public.cover_my_layouts where from_book_id = '$BOOK1'")
  news=$(q "select count(*) from public.cover_my_layouts where name = 'New'")
  olds=$(q "select string_agg(name, ',' order by exported_at desc) from public.cover_my_layouts where name like 'Old %'")
  report "S3 round $r" $(( w == 2 && saved == 2 && left == 5 && news == 2 && er == 0 )) "waiting $w/2, saved $saved, entries after $left (new $news; kept $olds), errors $er"
done

# ── S4: retired with 0033 (E16.3, Q3; see the header) ──

# ── C: the naive control ──
max=0; seen=0
for r in {1..$ROUNDS}; do
  q "delete from public.stock_calls" || exit 1
  args=(); for i in {1..20}; do args+=("${A}:select public.race_naive_reserve()"); done
  w=$(fire "$TMP/c" $args)
  ok=$(count "$TMP/c" '^t$'); er=$(errors "$TMP/c")
  rows=$(q "select count(*) from public.stock_calls where user_id = '$A'")
  print -r -- "     C round $r  waiting $w/20, passed $ok, rows $rows, errors $er"
  (( rows > max )) && max=$rows
  (( rows > 10 )) && seen=$((seen + 1))
done
report "C control" $(( seen > 0 )) "the naive function let more than 10 through in $seen of $ROUNDS rounds (most: $max)"

# ── C3: the S3 control (last: it swaps the guard in this scratch database) ──
q "create or replace function public.cover_my_layouts_guard()
   returns trigger language plpgsql security invoker set search_path = '' as \$\$
   begin
     if tg_op = 'INSERT' then
       perform pg_sleep(0.05);  -- 0032's trim, without its advisory lock
       delete from public.cover_my_layouts m
        where m.user_id = new.user_id and m.from_book_id = new.from_book_id
          and m.id in (select k.id from public.cover_my_layouts k
                        where k.user_id = new.user_id and k.from_book_id = new.from_book_id
                        order by k.exported_at desc, k.id desc offset 4);
       new.exported_at := now(); new.created_at := now();
     end if;
     return new;
   end \$\$" || exit 1
max=0; seen=0
for r in {1..$ROUNDS}; do
  seed5 || exit 1
  w=$(fire "$TMP/c3" "${A}:$ins" "${A}:$ins")
  saved=$(count "$TMP/c3" 'saved')
  left=$(q "select count(*) from public.cover_my_layouts where from_book_id = '$BOOK1'")
  print -r -- "     C3 round $r  waiting $w/2, saved $saved, entries after $left"
  (( left > max )) && max=$left
  (( left > 5 )) && seen=$((seen + 1))
done
report "C3 control" $(( seen > 0 )) "the guard without the lock ended with more than 5 in $seen of $ROUNDS rounds (most: $max)"

# ── C4: retired with S4 (0033, Q3) ──

print -r -- "race_0032: $fail failed"
(( fail == 0 ))
