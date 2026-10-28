-- 0026 book complete and words this month (E12 fix batch 3, designs 01b and 22f):
-- books.completed_at, complete_book (the rule and its refusals), the books
-- guard (completed only through complete_book, completed_at with it), the
-- reopen on its own (each event, and D1: a new version on a Final section
-- keeps the book completed) and words_month (rule 1).
-- Run: supabase/tests/sql/run.sh t0026.sql
\ir helpers.sql

\set A '''00000000-0000-4000-8000-00000000000a'''
\set B '''00000000-0000-4000-8000-00000000000b'''
\set C '''00000000-0000-4000-8000-00000000000c'''
\set ASA 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-4000-8000-00000000000a'';'
\set ASB 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-4000-8000-00000000000b'';'
\set ASC 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-4000-8000-00000000000c'';'
\set OWNER 'reset role; reset request.jwt.claim.sub;'
\set BOOK1 '''b0000000-0000-4000-8000-000000000001'''
\set BOOK2 '''b0000000-0000-4000-8000-000000000002'''
\set BOOKB '''b0000000-0000-4000-8000-00000000000b'''
\set BOOKC '''b0000000-0000-4000-8000-00000000000c'''
\set CI '''c0000000-0000-4000-8000-000000000001'''
\set C1 '''c0000000-0000-4000-8000-000000000002'''
\set CC '''c0000000-0000-4000-8000-000000000003'''
\set CW '''c0000000-0000-4000-8000-00000000000c'''
\set SI '''d0000000-0000-4000-8000-000000000001'''
\set S11 '''d0000000-0000-4000-8000-000000000002'''
\set S12 '''d0000000-0000-4000-8000-000000000003'''
\set SC '''d0000000-0000-4000-8000-000000000004'''
\set VI '''f0000000-0000-4000-8000-000000000001'''
\set V11 '''f0000000-0000-4000-8000-000000000002'''
\set V12 '''f0000000-0000-4000-8000-000000000003'''
\set VC '''f0000000-0000-4000-8000-000000000004'''
\set VCB '''f0000000-0000-4000-8000-000000000005'''

-- ── Seed (as the owner of the database: no RLS) ──
insert into auth.users values (:A), (:B), (:C);
insert into public.books (id, user_id, title) values
  (:BOOK1, :A, 'Sourdough at Home'),
  (:BOOK2, :A, 'Empty Book'),
  (:BOOKB, :B, 'B Book'),
  (:BOOKC, :C, 'Words Book');
insert into public.chapters (id, user_id, book_id, position, kind, title) values
  (:CI, :A, :BOOK1, 1, 'intro', 'Introduction'),
  (:C1, :A, :BOOK1, 2, 'chapter', 'Starter basics'),
  (:CC, :A, :BOOK1, 3, 'conclusion', 'Conclusion'),
  (:CW, :C, :BOOKC, 1, 'chapter', 'Words chapter');
insert into public.sections (id, user_id, chapter_id, position, title, status) values
  (:SI, :A, :CI, 1, 'Why bake', 'final'),
  (:S11, :A, :C1, 1, 'Your starter', 'final'),
  (:S12, :A, :C1, 2, 'Feeding', 'draft'),
  (:SC, :A, :CC, 1, 'Keep baking', 'final');
insert into public.section_versions (id, user_id, section_id, version_no, content, source) values
  (:VI, :A, :SI, 1, 'Intro text.', 'generate'),
  (:V11, :A, :S11, 1, 'Starter text.', 'manual'),
  (:V12, :A, :S12, 1, 'Feeding text.', 'manual'),
  (:VC, :A, :SC, 1, 'The end.', 'manual'),
  (:VCB, :A, :SC, 2, E'  \n ', 'manual');
update public.sections set current_version_id = :VI where id = :SI;
update public.sections set current_version_id = :V11 where id = :S11;
update public.sections set current_version_id = :V12 where id = :S12;
update public.sections set current_version_id = :VC where id = :SC;

-- The outline approval, as approve_outline does it (the 0017 guard).
create function pg_temp.approve(b uuid) returns void language plpgsql as $$
begin
  perform set_config('kdp.outline_approve', 'on', true);
  update public.books set outline_approved_at = now() where id = b;
  perform set_config('kdp.outline_approve', '', true);
end $$;
-- "completed yes" / "in_progress no": the status and whether completed_at is set.
create function pg_temp.st(b uuid) returns text language sql security definer as $$
  select status || ' ' || case when completed_at is null then 'no' else 'yes' end from public.books where id = b $$;
create function pg_temp.at(b uuid) returns timestamptz language sql security definer as $$
  select completed_at from public.books where id = b $$;
-- Complete again after a reopen (as the caller).
create function pg_temp.again(b uuid) returns text language plpgsql as $$
begin
  perform public.complete_book(b);
  return 'ok';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;
grant execute on all functions in schema pg_temp to public;

-- ── 1. Schema ──
select pg_temp.chk('completed_at: a nullable timestamptz',
  (select data_type = 'timestamp with time zone' and is_nullable = 'YES' from information_schema.columns where table_name = 'books' and column_name = 'completed_at'));
select pg_temp.chk('the completed_at check exists', exists (select 1 from pg_constraint where conname = 'books_completed_at_check'));
select pg_temp.chk('complete_book and words_month: authenticated only',
  has_function_privilege('authenticated', 'public.complete_book(uuid)', 'execute') and not has_function_privilege('anon', 'public.complete_book(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.words_month()', 'execute') and not has_function_privilege('anon', 'public.words_month()', 'execute'));
select pg_temp.chk('trigger functions: not executable by the API roles',
  not has_function_privilege('authenticated', 'public.books_status_guard()', 'execute')
  and not has_function_privilege('anon', 'public.books_status_guard()', 'execute')
  and not has_function_privilege('authenticated', 'public.book_reopen_on_change()', 'execute')
  and not has_function_privilege('anon', 'public.book_reopen_on_change()', 'execute'));
select pg_temp.chk('three new triggers',
  (select count(*) from pg_trigger where tgname in ('books_status_guard', 'sections_reopen_book', 'chapters_reopen_book') and not tgisinternal) = 3);
select pg_temp.chk('existing books start in progress, with no completed_at', pg_temp.st(:BOOK1) = 'in_progress no');

-- ── 2. complete_book: the rule ──
:ASA
select pg_temp.expect('outline not approved: refused', format('select public.complete_book(%L)', :BOOK1), 'P0001 outline_not_approved | Approve the outline in 05 first.');
:OWNER
select pg_temp.approve(:BOOK1);
select pg_temp.approve(:BOOK2);
:ASA
select pg_temp.expect('a book with no sections: refused', format('select public.complete_book(%L)', :BOOK2), 'P0001 book_empty | The book has no sections yet.');
select pg_temp.expect('a Draft section: refused, with the count', format('select public.complete_book(%L)', :BOOK1), 'P0001 section_not_final | 1 section is not Final.');
select pg_temp.expect('the writer sets 1.2 to Final', format($q$update public.sections set status = 'final' where id = %L$q$, :S12), 'OK 1');
select pg_temp.expect('two not Final: the count says 2', format($q$update public.sections set status = 'reviewed' where id in (%L, %L)$q$, :S11, :S12), 'OK 2');
select pg_temp.expect('the plural detail', format('select public.complete_book(%L)', :BOOK1), 'P0001 section_not_final | 2 sections are not Final.');
select pg_temp.expect('both Final again', format($q$update public.sections set status = 'final' where id in (%L, %L)$q$, :S11, :S12), 'OK 2');
:OWNER
update public.sections set current_version_id = :VCB where id = :SC;
:ASA
select pg_temp.expect('a Final section with blank text: refused', format('select public.complete_book(%L)', :BOOK1), 'P0001 section_no_text | 1 section has no text.');
:OWNER
update public.sections set current_version_id = :VC where id = :SC;
insert into public.sections (user_id, chapter_id, position, title, status) values (:A, :C1, 3, 'No writing yet', 'final');
select pg_temp.approve(:BOOK1);
:ASA
select pg_temp.expect('a Final section with no version: refused', format('select public.complete_book(%L)', :BOOK1), 'P0001 section_no_text | 1 section has no text.');
select pg_temp.expect('the empty section is removed (no writing)', format($q$delete from public.sections where chapter_id = %L and position = 3$q$, :C1), 'OK 1');
:OWNER
select pg_temp.approve(:BOOK1);
update public.sections set needs_review = true where id = :S11;
:ASA
select pg_temp.expect('a section that needs review: refused', format('select public.complete_book(%L)', :BOOK1), 'P0001 needs_review | 1 section needs review.');
select pg_temp.expect('Mark as reviewed', format('update public.sections set needs_review = false where id = %L', :S11), 'OK 1');
:OWNER
update public.chapters set needs_review = true where id = :C1;
:ASA
select pg_temp.expect('a chapter that needs review: refused, with the 05 line', format('select public.complete_book(%L)', :BOOK1), 'P0001 needs_review | Approve the outline in 05 to clear the chapter marks.');
:OWNER
update public.chapters set needs_review = false where id = :C1;
:ASB
select pg_temp.expect('B cannot complete A''s book (not found)', format('select public.complete_book(%L)', :BOOK1), 'P0002 book_not_found%');
:ASA
select public.complete_book(:BOOK1) as at1 \gset
:OWNER
select pg_temp.chk('completed, with completed_at', pg_temp.st(:BOOK1) = 'completed yes', pg_temp.st(:BOOK1));
select pg_temp.chk('completed_at is the value complete_book returned', pg_temp.at(:BOOK1) = :'at1'::timestamptz);
:ASA
select pg_temp.chk('a second call returns the same time (a double click)', public.complete_book(:BOOK1) = :'at1'::timestamptz);
:OWNER
select pg_temp.chk('and changes nothing', pg_temp.at(:BOOK1) = :'at1'::timestamptz);

-- ── 3. The guard: completed only through complete_book ──
:ASA
select pg_temp.expect('a plain update to completed: refused', format($q$update public.books set status = 'completed' where id = %L$q$, :BOOK2), 'P0001 complete_rpc%');
select pg_temp.expect('a new completed_at on a completed book: refused', format($q$update public.books set completed_at = now() - interval '1 day' where id = %L$q$, :BOOK1), 'P0001 complete_rpc%');
select pg_temp.expect('a new book that is completed: refused', $q$insert into public.books (title, status) values ('X', 'completed')$q$, 'P0001 complete_rpc%');
select pg_temp.expect('a new book with a completed_at: added', $q$insert into public.books (title, completed_at) values ('Y', now())$q$, 'OK 1');
select pg_temp.chk('its completed_at is cleared', (select completed_at is null from public.books where title = 'Y'));
select pg_temp.expect('a completed_at on a book in progress: saved as null', format('update public.books set completed_at = now() where id = %L', :BOOK2), 'OK 1');
:OWNER
select pg_temp.chk('still null', pg_temp.st(:BOOK2) = 'in_progress no');
select pg_temp.expect('the owner role cannot skip it either', format($q$update public.books set status = 'completed' where id = %L$q$, :BOOK2), 'P0001 complete_rpc%');
:ASA
select pg_temp.expect('a rename of a completed book', format($q$update public.books set title = 'Sourdough at Home, Again' where id = %L$q$, :BOOK1), 'OK 1');
:OWNER
select pg_temp.chk('the rename keeps it completed (same time)', pg_temp.st(:BOOK1) = 'completed yes' and pg_temp.at(:BOOK1) = :'at1'::timestamptz);

-- ── 4. D1: a new version on a Final section keeps the book completed ──
:ASA
select pg_temp.expect('save_version on a Final section', format($q$select public.save_version(%L, 'Starter text, edited after Final.', %L)$q$, :S11, :V11), 'OK 1');
:OWNER
select pg_temp.chk('D1: save_version keeps the book completed (same time)', pg_temp.st(:BOOK1) = 'completed yes' and pg_temp.at(:BOOK1) = :'at1'::timestamptz, pg_temp.st(:BOOK1));
select pg_temp.chk('and the section stays Final', (select status from public.sections where id = :S11) = 'final');
select current_version_id as cur11 from public.sections where id = :S11 \gset
:ASA
select pg_temp.expect('save_version kept aside (not current)', format($q$select public.save_version(%L, 'An aside.', null, false)$q$, :S11), 'OK 1');
select pg_temp.expect('restore_version on a Final section', format('select public.restore_version(%L, %L, %L)', :S11, :V11, :'cur11'), 'OK 1');
:OWNER
select pg_temp.chk('D1: restore_version keeps the book completed (same time)', pg_temp.st(:BOOK1) = 'completed yes' and pg_temp.at(:BOOK1) = :'at1'::timestamptz, pg_temp.st(:BOOK1));
-- A Generate finish (the service role): a new current version, needs_review stays false while locked.
insert into public.section_versions (user_id, section_id, version_no, content, source) values (:A, :S12, 2, 'Feeding text, written again.', 'generate');
update public.sections set current_version_id = (select id from public.section_versions where section_id = :S12 and version_no = 2),
                           needs_review = needs_review or false
 where id = :S12;
select pg_temp.chk('D1: a Generate finish keeps the book completed', pg_temp.st(:BOOK1) = 'completed yes' and pg_temp.at(:BOOK1) = :'at1'::timestamptz);
:ASA
select pg_temp.expect('Final set to Final again', format($q$update public.sections set status = 'final' where id = %L$q$, :S11), 'OK 1');
select pg_temp.expect('needs_review set to false again', format('update public.sections set needs_review = false where id = %L', :S11), 'OK 1');
:OWNER
select pg_temp.chk('no change, no reopen', pg_temp.st(:BOOK1) = 'completed yes' and pg_temp.at(:BOOK1) = :'at1'::timestamptz);

-- ── 5. Reopen on its own: each event ──
:ASA
select pg_temp.expect('a section leaves Final (Final → Reviewed)', format($q$update public.sections set status = 'reviewed' where id = %L$q$, :S11), 'OK 1');
:OWNER
select pg_temp.chk('reopened: in progress, completed_at null', pg_temp.st(:BOOK1) = 'in_progress no', pg_temp.st(:BOOK1));
:ASA
select pg_temp.expect('back to Final', format($q$update public.sections set status = 'final' where id = %L$q$, :S11), 'OK 1');
select pg_temp.chk('complete again', pg_temp.again(:BOOK1) = 'ok', pg_temp.again(:BOOK1));
:OWNER
select pg_temp.chk('a new completed_at after the reopen', pg_temp.at(:BOOK1) > :'at1'::timestamptz);
update public.sections set needs_review = true where id = :S12;
select pg_temp.chk('a section gets needs_review (a Generate finish while unlocked): reopened', pg_temp.st(:BOOK1) = 'in_progress no', pg_temp.st(:BOOK1));
update public.sections set needs_review = false where id = :S12;
:ASA
select pg_temp.chk('complete again (2)', pg_temp.again(:BOOK1) = 'ok');
:OWNER
update public.chapters set needs_review = true where id = :C1;
select pg_temp.chk('a chapter gets needs_review: reopened', pg_temp.st(:BOOK1) = 'in_progress no', pg_temp.st(:BOOK1));
update public.chapters set needs_review = false where id = :C1;
:ASA
select pg_temp.chk('complete again (3)', pg_temp.again(:BOOK1) = 'ok');
select pg_temp.expect('a section is added', format($q$insert into public.sections (chapter_id, position, title) values (%L, 3, 'New section')$q$, :C1), 'OK 1');
:OWNER
select pg_temp.chk('a section added: reopened', pg_temp.st(:BOOK1) = 'in_progress no', pg_temp.st(:BOOK1));
:ASA
select pg_temp.expect('the new section is removed', format($q$delete from public.sections where chapter_id = %L and position = 3$q$, :C1), 'OK 1');
:OWNER
select pg_temp.approve(:BOOK1);
:ASA
select pg_temp.chk('complete again (4)', pg_temp.again(:BOOK1) = 'ok');
select pg_temp.expect('a chapter is added', format($q$insert into public.chapters (book_id, position, kind, title) values (%L, 4, 'chapter', 'New chapter')$q$, :BOOK1), 'OK 1');
:OWNER
select pg_temp.chk('a chapter added: reopened', pg_temp.st(:BOOK1) = 'in_progress no', pg_temp.st(:BOOK1));
:ASA
select pg_temp.expect('the new chapter is removed', format('delete from public.chapters where book_id = %L and position = 4', :BOOK1), 'OK 1');
:OWNER
select pg_temp.approve(:BOOK1);
:ASA
select pg_temp.chk('complete again (5)', pg_temp.again(:BOOK1) = 'ok');
select pg_temp.expect('an outline edit (a chapter title)', format($q$update public.chapters set title = 'Starter basics, part one' where id = %L$q$, :C1), 'OK 1');
:OWNER
select pg_temp.chk('the outline approval cleared: reopened', pg_temp.st(:BOOK1) = 'in_progress no' and (select outline_approved_at is null from public.books where id = :BOOK1), pg_temp.st(:BOOK1));
select pg_temp.approve(:BOOK1);
:ASA
select pg_temp.chk('complete again (6)', pg_temp.again(:BOOK1) = 'ok');
select pg_temp.expect('the approval cleared on the book itself', format('update public.books set outline_approved_at = null where id = %L', :BOOK1), 'OK 1');
:OWNER
select pg_temp.chk('cleared on the book: reopened', pg_temp.st(:BOOK1) = 'in_progress no', pg_temp.st(:BOOK1));
select pg_temp.approve(:BOOK1);
:ASA
select pg_temp.chk('complete again (7)', pg_temp.again(:BOOK1) = 'ok');
select pg_temp.expect('Reopen (a plain update, allowed by RLS)', format($q$update public.books set status = 'in_progress' where id = %L$q$, :BOOK1), 'OK 1');
:OWNER
select pg_temp.chk('Reopen: in progress, completed_at null', pg_temp.st(:BOOK1) = 'in_progress no', pg_temp.st(:BOOK1));
:ASA
select pg_temp.expect('Reopen of a book in progress changes nothing', format($q$update public.books set status = 'in_progress' where id = %L$q$, :BOOK2), 'OK 1');
select pg_temp.chk('complete again (8)', pg_temp.again(:BOOK1) = 'ok');
:ASB
select pg_temp.expect('B cannot reopen A''s book', format($q$update public.books set status = 'in_progress' where id = %L$q$, :BOOK1), 'OK 0');
:OWNER
select pg_temp.chk('A''s book is still completed', pg_temp.st(:BOOK1) = 'completed yes');
select pg_temp.chk('the check holds on every row',
  not exists (select 1 from public.books where (status = 'completed') <> (completed_at is not null)));

-- ── 6. words_month (rule 1) ──
-- C's sections: m = the 1st of this month, 00:00 UTC.
--   W1  v1 before (100)       → current v2 this month (150)   +50
--   W2  only v1 this month (40), current                      +40
--   W3  v1 before (200)       → current v2 this month (120)   0 (a cut never subtracts)
--   W4  current v1 before (80), no change                     0
--   W5  no version                                            0
--   W6  v1 before (10), v2 before (30) → current v3 (35)     +5 (the newest before the 1st)
--   W7  v1 at m - 1 second (20) → current v2 at m (25)        +5 (the edge: m counts as this month)
--   W8  current v1 before (50), v2 this month (500) kept aside, not current   0
create function pg_temp.words(n int) returns text language sql as $$ select rtrim(repeat('w ', n)) $$;
create temp table m as select (date_trunc('month', now() at time zone 'utc') at time zone 'utc') as start;
grant select on m to public;
insert into public.sections (id, user_id, chapter_id, position, title)
  select ('e0000000-0000-4000-8000-00000000000' || i)::uuid, :C, :CW, i, 'W' || i from generate_series(1, 8) i;
insert into public.section_versions (user_id, section_id, version_no, content, source, created_at)
  select :C, ('e0000000-0000-4000-8000-00000000000' || x.s)::uuid, x.v, pg_temp.words(x.n), 'manual', m.start + x.at
    from m, (values (1, 1, 100, interval '-10 days'), (1, 2, 150, interval '0'),
                    (2, 1, 40, interval '0'),
                    (3, 1, 200, interval '-3 days'), (3, 2, 120, interval '0'),
                    (4, 1, 80, interval '-20 days'),
                    (6, 1, 10, interval '-30 days'), (6, 2, 30, interval '-2 days'), (6, 3, 35, interval '0'),
                    (7, 1, 20, interval '-1 second'), (7, 2, 25, interval '0'),
                    (8, 1, 50, interval '-5 days'), (8, 2, 500, interval '0')) as x(s, v, n, at);
update public.sections s
   set current_version_id = (select v.id from public.section_versions v where v.section_id = s.id
                              and v.version_no = case when s.title in ('W4', 'W8') then 1 else (select max(version_no) from public.section_versions w where w.section_id = s.id) end)
 where s.chapter_id = :CW and s.title <> 'W5';
select pg_temp.chk('word counts come from md_word_count', (select word_count from public.section_versions where content = pg_temp.words(150)) = 150);
:ASC
select pg_temp.chk('words_month: 100 words added this month', (public.words_month() ->> 'words')::int = 100, public.words_month() ->> 'words');
select pg_temp.chk('month_start is the 1st at 00:00 UTC',
  (public.words_month() ->> 'month_start')::timestamptz = (select start from m));
:ASB
select pg_temp.chk('B sees none of C''s words', (public.words_month() ->> 'words')::int = 0, public.words_month() ->> 'words');
reset role;
set role anon;
select pg_temp.expect('anon cannot call words_month', 'select public.words_month()', '42501%');
select pg_temp.expect('anon cannot call complete_book', format('select public.complete_book(%L)', :BOOK1), '42501%');
:OWNER
