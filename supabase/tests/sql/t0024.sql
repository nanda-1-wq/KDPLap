-- 0024 kept findings (PRODUCE gate G5, design 22d "Keep as is"): the table
-- (RLS: own select, insert, delete; no update), the shape (type, message,
-- quote, check_at), the guard (owner, a gap only from the current check, old
-- gaps removed, at most 50 per section), the unique keys, the cascades, and
-- "advice only" (the section is never changed).
-- Run: supabase/tests/sql/run.sh t0024.sql
\ir helpers.sql

\set A '''00000000-0000-4000-8000-00000000000a'''
\set B '''00000000-0000-4000-8000-00000000000b'''
\set BOOK1 '''b0000000-0000-4000-8000-000000000001'''
\set BOOK2 '''b0000000-0000-4000-8000-000000000002'''
\set C1 '''c0000000-0000-4000-8000-000000000001'''
\set C2 '''c0000000-0000-4000-8000-000000000002'''
\set S1 '''d0000000-0000-4000-8000-000000000001'''
\set S2 '''d0000000-0000-4000-8000-000000000002'''
\set S3 '''d0000000-0000-4000-8000-000000000003'''
\set SB '''d0000000-0000-4000-8000-00000000000b'''
\set T1 '''2026-10-16 10:00:00.123456+00'''
\set T2 '''2026-10-16 11:00:00.654321+00'''

-- ── Seed (as the owner of the database: no RLS) ──
insert into auth.users values (:A), (:B), ('00000000-0000-4000-8000-00000000000c');
insert into public.books (id, user_id, title) values (:BOOK1, :A, 'Chair Yoga for Seniors Over 60'), (:BOOK2, :B, 'Walking After 70');
insert into public.chapters (id, user_id, book_id, position) values (:C1, :A, :BOOK1, 1), (:C2, :B, :BOOK2, 1);
insert into public.sections (id, user_id, chapter_id, position) values (:S1, :A, :C1, 1), (:S2, :A, :C1, 2), (:S3, :A, :C1, 3), (:SB, :B, :C2, 1);
-- The section's current check: two objective gaps, a drift and a voice finding.
create function pg_temp.f(t text, m text, q text) returns jsonb language sql as $$
  select jsonb_build_object('type', t, 'message', m, 'quote', q) $$;
insert into public.section_checks (section_id, user_id, book_id, findings, areas, words, inputs_key, checked_at)
values (:S1, :A, :BOOK1, jsonb_build_array(
          pg_temp.f('drift', 'Weight loss is not in the Brief or the locked positioning.', 'Chair yoga also helps you lose weight fast.'),
          pg_temp.f('voice', 'This sentence is long and formal.', 'This gentle yet powerful movement serves as a wonderful foundation.'),
          pg_temp.f('objective', 'The text never shows the forward roll.', ''),
          pg_temp.f('objective', 'The section never says how long to rest between rolls.', '')),
        '{"objective": "issues", "voice": "issues", "drift": "issues"}', 310, '0123456789abcdef', :T1),
       (:SB, :B, :BOOK2, jsonb_build_array(pg_temp.f('objective', 'B''s gap.', '')),
        '{"objective": "issues", "voice": "pass", "drift": "pass"}', 120, '0123456789abcdef', :T1);
create function pg_temp.sect(s uuid) returns public.sections language sql security definer as $$
  select * from public.sections where id = s $$;
create function pg_temp.nkept(s uuid) returns bigint language sql security definer as $$
  select count(*) from public.kept_findings where section_id = s $$;
create function pg_temp.nall() returns bigint language sql security definer as $$ select count(*) from public.kept_findings $$;
grant execute on all functions in schema pg_temp to public;
select row_to_json(pg_temp.sect(:S1))::text as sect_before \gset

-- ── The table ──
select pg_temp.chk('RLS on', (select relrowsecurity from pg_class where oid = 'public.kept_findings'::regclass));
select pg_temp.chk('three policies: select, insert, delete (no update)',
  (select array_agg(cmd::text order by cmd::text) from pg_policies where tablename = 'kept_findings') = array['DELETE', 'INSERT', 'SELECT']);
select pg_temp.chk('no update privilege for the API roles',
  not has_table_privilege('authenticated', 'public.kept_findings', 'update') and not has_table_privilege('anon', 'public.kept_findings', 'update'));
select pg_temp.chk('guard function: not executable by the API roles',
  not has_function_privilege('authenticated', 'public.kept_findings_guard()', 'execute')
  and not has_function_privilege('anon', 'public.kept_findings_guard()', 'execute'));
select pg_temp.chk('an index on user_id and the two unique keys',
  (select count(*) from pg_indexes where tablename = 'kept_findings' and indexname in ('kept_findings_user_id_idx', 'kept_findings_quote_key', 'kept_findings_gap_key')) = 3);

-- ── A keeps findings ──
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.expect('keep a drift finding with its quote (user_id from the session)',
  format($q$insert into public.kept_findings (section_id, type, message, quote) values (%L, 'drift', 'Weight loss is not in the Brief or the locked positioning.', 'Chair yoga also helps you lose weight fast.')$q$, :S1), 'OK 1');
select pg_temp.chk('the row is A''s', (select user_id from public.kept_findings where type = 'drift') = :A);
select pg_temp.expect('the same type and quote again: 23505 (already kept)',
  format($q$insert into public.kept_findings (section_id, type, message, quote) values (%L, 'drift', 'Reworded message.', 'Chair yoga also helps you lose weight fast.')$q$, :S1), '23505%');
select pg_temp.expect('the same quote with another type: a second row',
  format($q$insert into public.kept_findings (section_id, type, message, quote) values (%L, 'voice', 'Too formal.', 'Chair yoga also helps you lose weight fast.')$q$, :S1), 'OK 1');
select pg_temp.expect('a quote not in any check can still be kept (no AI data is trusted here)',
  format($q$insert into public.kept_findings (section_id, type, message, quote) values (%L, 'voice', 'Plain words.', 'Repeat for optimal mobility.')$q$, :S2), 'OK 1');
select pg_temp.expect('a gap from the current check (check_at = checked_at, same message)',
  format($q$insert into public.kept_findings (section_id, type, message, quote, check_at) values (%L, 'objective', 'The text never shows the forward roll.', '', %L)$q$, :S1, :T1), 'OK 1');
select pg_temp.expect('the other gap of the same check: a second row',
  format($q$insert into public.kept_findings (section_id, type, message, quote, check_at) values (%L, 'objective', 'The section never says how long to rest between rolls.', '', %L)$q$, :S1, :T1), 'OK 1');
select pg_temp.expect('the same gap again: 23505',
  format($q$insert into public.kept_findings (section_id, type, message, quote, check_at) values (%L, 'objective', 'The text never shows the forward roll.', '', %L)$q$, :S1, :T1), '23505%');
select pg_temp.chk('A reads A''s rows', (select count(*) from public.kept_findings) = 5);

-- ── The shape ──
select pg_temp.expect('type outside the list refused',
  format($q$insert into public.kept_findings (section_id, type, message, quote) values (%L, 'style', 'M.', 'A quote here.')$q$, :S2), '23514%kept_findings_type_check%');
select pg_temp.expect('a blank message refused',
  format($q$insert into public.kept_findings (section_id, type, message, quote) values (%L, 'voice', E' \n\t', 'A quote here.')$q$, :S2), '23514%kept_findings_message_check%');
select pg_temp.expect('a 301-character message refused',
  format($q$insert into public.kept_findings (section_id, type, message, quote) values (%L, 'voice', %L, 'A quote here.')$q$, :S2, repeat('m', 301)), '23514%kept_findings_message_check%');
select pg_temp.expect('a 300-character message and quote work',
  format($q$insert into public.kept_findings (section_id, type, message, quote) values (%L, 'voice', %L, %L)$q$, :S2, repeat('m', 300), repeat('q', 300)), 'OK 1');
select pg_temp.expect('a 301-character quote refused',
  format($q$insert into public.kept_findings (section_id, type, message, quote) values (%L, 'voice', 'M.', %L)$q$, :S2, repeat('q', 301)), '23514%kept_findings_quote_length_check%');
select pg_temp.expect('a blank quote refused',
  format($q$insert into public.kept_findings (section_id, type, message, quote) values (%L, 'voice', 'M.', '   ')$q$, :S2), '23514%kept_findings_quote_check%');
select pg_temp.expect('an empty quote for drift refused (gaps are objective only)',
  format($q$insert into public.kept_findings (section_id, type, message, quote, check_at) values (%L, 'drift', 'M.', '', %L)$q$, :S1, :T1), '23514%kept_findings_quote_check%');
select pg_temp.expect('a gap with no check_at refused',
  format($q$insert into public.kept_findings (section_id, type, message, quote) values (%L, 'objective', 'The text never shows the forward roll.', '')$q$, :S1), '23514%kept_findings_check_at_check%');
select pg_temp.expect('a quote with a check_at refused',
  format($q$insert into public.kept_findings (section_id, type, message, quote, check_at) values (%L, 'voice', 'M.', 'Another quote.', %L)$q$, :S2, :T1), '23514%kept_findings_check_at_check%');

-- ── The guard: a gap only from the current check ──
select pg_temp.expect('a gap with another check time refused',
  format($q$insert into public.kept_findings (section_id, type, message, quote, check_at) values (%L, 'objective', 'The text never shows the forward roll.', '', %L)$q$, :S1, :T2), 'P0001 kept_gap_not_in_check%');
select pg_temp.expect('a gap with a message not in the check refused',
  format($q$insert into public.kept_findings (section_id, type, message, quote, check_at) values (%L, 'objective', 'A gap the AI never found.', '', %L)$q$, :S1, :T1), 'P0001 kept_gap_not_in_check%');
select pg_temp.expect('a gap on a section with no check refused',
  format($q$insert into public.kept_findings (section_id, type, message, quote, check_at) values (%L, 'objective', 'The text never shows the forward roll.', '', %L)$q$, :S3, :T1), 'P0001 kept_gap_not_in_check%');
-- A message that only matches a finding with a quote is not a gap.
select pg_temp.expect('a gap whose message belongs to a quoted finding refused',
  format($q$insert into public.kept_findings (section_id, type, message, quote, check_at) values (%L, 'objective', 'This sentence is long and formal.', '', %L)$q$, :S1, :T1), 'P0001 kept_gap_not_in_check%');

-- ── A new check: old gaps go on the next keep; quotes stay ──
reset role;
update public.section_checks set checked_at = :T2,
  findings = jsonb_build_array(pg_temp.f('objective', 'The text never shows the forward roll.', ''))
  where section_id = :S1;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.chk('before the next keep: the 2 old gaps are still there', (select count(*) from public.kept_findings where section_id = :S1 and quote = '') = 2);
select pg_temp.expect('the same gap from the new check works',
  format($q$insert into public.kept_findings (section_id, type, message, quote, check_at) values (%L, 'objective', 'The text never shows the forward roll.', '', %L)$q$, :S1, :T2), 'OK 1');
select pg_temp.chk('the old gaps are removed; the new gap and the quotes stay',
  (select count(*) from public.kept_findings where section_id = :S1 and quote = '') = 1
  and (select check_at from public.kept_findings where section_id = :S1 and quote = '') = :T2::timestamptz
  and (select count(*) from public.kept_findings where section_id = :S1 and quote <> '') = 2);
reset role;
update public.section_checks set checked_at = '2026-10-16 12:00:00+00', findings = '[]' where section_id = :S1;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.expect('a quote keep after another check works',
  format($q$insert into public.kept_findings (section_id, type, message, quote) values (%L, 'objective', 'The safety note comes after the steps.', 'If you feel a sharp pain, stop.')$q$, :S1), 'OK 1');
select pg_temp.chk('that keep removes the gap of the older check too',
  (select count(*) from public.kept_findings where section_id = :S1 and quote = '') = 0
  and (select count(*) from public.kept_findings where section_id = :S1) = 3);

-- ── No update; delete own (Undo) ──
select pg_temp.expect('update refused (a keep is never changed)',
  format($q$update public.kept_findings set message = 'X' where section_id = %L$q$, :S1), '42501%');
select pg_temp.expect('Undo: A deletes A''s row',
  format($q$delete from public.kept_findings where section_id = %L and type = 'voice'$q$, :S1), 'OK 1');
select pg_temp.chk('advice only: the section row is unchanged', row_to_json(pg_temp.sect(:S1))::text = :'sect_before', row_to_json(pg_temp.sect(:S1))::text);

-- ── At most 50 per section ──
reset role;
select pg_temp.nkept(:S2) as n2 \gset
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.expect('fill section 2 up to 50',
  format($q$insert into public.kept_findings (section_id, type, message, quote) select %L, 'voice', 'M ' || i, 'Quote number ' || i from generate_series(1, %s) i$q$, :S2, 50 - :n2), 'OK ' || (50 - :n2));
select pg_temp.expect('the 51st keep refused', format($q$insert into public.kept_findings (section_id, type, message, quote) values (%L, 'drift', 'M.', 'One more quote.')$q$, :S2), 'P0001 kept_limit%');
select pg_temp.expect('a bulk insert over the cap refused too',
  format($q$insert into public.kept_findings (section_id, type, message, quote) select %L, 'drift', 'M ' || i, 'Bulk ' || i from generate_series(1, 2) i$q$, :S2), 'P0001 kept_limit%');
select pg_temp.expect('a bulk insert of 51 on an empty section stops at the 51st (the trigger sees earlier rows of the statement)',
  format($q$insert into public.kept_findings (section_id, type, message, quote) select %L, 'drift', 'M ' || i, 'Bulk ' || i from generate_series(1, 51) i$q$, :S3), 'P0001 kept_limit%');
select pg_temp.expect('two keeps on section 3 work',
  format($q$insert into public.kept_findings (section_id, type, message, quote) select %L, 'drift', 'M ' || i, 'Bulk ' || i from generate_series(1, 2) i$q$, :S3), 'OK 2');
select pg_temp.expect('after Undo, a keep works again',
  format($q$with d as (delete from public.kept_findings where section_id = %L and quote = 'Quote number 1' returning 1) select 1 from d$q$, :S2), 'OK 1');
select pg_temp.expect('the 50th again', format($q$insert into public.kept_findings (section_id, type, message, quote) values (%L, 'drift', 'M.', 'One more quote.')$q$, :S2), 'OK 1');
select pg_temp.chk('section 2 holds exactly 50', (select count(*) from public.kept_findings where section_id = :S2) = 50);

-- ── Cross-user ──
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000b';
select pg_temp.chk('B reads 0 of A''s rows', (select count(*) from public.kept_findings) = 0);
select pg_temp.expect('B keeps on A''s section: refused',
  format($q$insert into public.kept_findings (section_id, type, message, quote) values (%L, 'drift', 'M.', 'Q from B.')$q$, :S1), '42501%');
select pg_temp.expect('B keeps on A''s section as A: refused',
  format($q$insert into public.kept_findings (user_id, section_id, type, message, quote) values (%L, %L, 'drift', 'M.', 'Q from B.')$q$, :A, :S1), '42501%');
select pg_temp.expect('B keeps a gap on A''s section: refused by RLS, not the gap rule',
  format($q$insert into public.kept_findings (section_id, type, message, quote, check_at) values (%L, 'objective', 'The text never shows the forward roll.', '', %L)$q$, :S1, :T2), '42501%');
select pg_temp.expect('B deletes 0 of A''s rows', 'delete from public.kept_findings', 'OK 0');
select pg_temp.expect('B keeps a gap on B''s own section works',
  format($q$insert into public.kept_findings (section_id, type, message, quote, check_at) values (%L, 'objective', 'B''s gap.', '', %L)$q$, :SB, :T1), 'OK 1');
reset role;
select pg_temp.chk('A''s rows are all still there', (select count(*) from public.kept_findings where user_id = :A) = pg_temp.nkept(:S1) + pg_temp.nkept(:S2) + pg_temp.nkept(:S3));

-- The service role bypasses RLS: the guard checks the owner.
set role service_role;
select pg_temp.expect('server: a row for A on B''s section refused',
  format($q$insert into public.kept_findings (user_id, section_id, type, message, quote) values (%L, %L, 'drift', 'M.', 'Q.')$q$, :A, :SB), 'P0001 kept_owner%');
select pg_temp.expect('server: a missing section refused by the foreign key',
  format($q$insert into public.kept_findings (user_id, section_id, type, message, quote) values (%L, 'd0000000-0000-4000-8000-0000000000ff', 'drift', 'M.', 'Q.')$q$, :A), '23503%');
reset role;

-- ── anon sees nothing ──
set role anon;
select pg_temp.chk('anon reads 0 rows', coalesce((xpath('/row/n/text()', query_to_xml('select count(*) as n from public.kept_findings', false, true, '')))[1]::text, 'denied') in ('0', 'denied'));
reset role;

-- ── Cascades ──
select pg_temp.nkept(:S3) as n3 \gset
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.expect('A deletes section 3', format('delete from public.sections where id = %L', :S3), 'OK 1');
reset role;
select pg_temp.chk('section delete: its kept rows go with it', pg_temp.nkept(:S3) = 0 and :n3 = 2);
delete from auth.users where id = :B;
select pg_temp.chk('user delete: B''s kept rows go', (select count(*) from public.kept_findings where section_id = :SB) = 0);
select pg_temp.chk('A''s rows stay', pg_temp.nkept(:S1) > 0 and pg_temp.nkept(:S2) = 50);
