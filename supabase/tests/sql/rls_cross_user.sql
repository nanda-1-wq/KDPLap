-- Cross-user Row Level Security: user B cannot read or write user A's rows,
-- in every public table. Also: every public table has RLS on, and anon sees
-- nothing. Added in Batch B1.
-- Run: supabase/tests/sql/run.sh rls_cross_user.sql
\ir helpers.sql

-- ── Seed: user A owns one row in every table; user B owns a book, topic and pen name ──
insert into auth.users values ('00000000-0000-4000-8000-00000000000a'), ('00000000-0000-4000-8000-00000000000b');
insert into public.pen_names (id, user_id, name) values
  ('a1000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'Pen A'),
  ('b1000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000b', 'Pen B');
insert into public.topics (id, user_id, name) values
  ('a2000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'Topic A'),
  ('b2000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000b', 'Topic B');
insert into public.topic_page_books (user_id, topic_id, position, title) values
  ('00000000-0000-4000-8000-00000000000a', 'a2000000-0000-4000-8000-000000000001', 1, 'Page book A');
insert into public.books (id, user_id, topic_id, pen_name_id, title) values
  ('a3000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Book A'),
  ('b3000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000b', 'b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'Book B');
insert into public.book_briefs (book_id, user_id, topic_text) values ('a3000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'Topic A');
insert into public.competitors (user_id, book_id, title) values ('00000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-000000000001', 'Competitor A');
insert into public.research_insights (book_id, user_id) values ('a3000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a');
insert into public.research_sources (user_id, book_id, kind, body) values ('00000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-000000000001', 'note', 'Note A');
insert into public.positioning (book_id, user_id, one_sentence) values ('a3000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'Positioning A');
insert into public.title_options (user_id, book_id, title) values ('00000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-000000000001', 'Option A');
insert into public.chapters (id, user_id, book_id, position) values ('a4000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-000000000001', 1);
insert into public.chapters (id, user_id, book_id, position) values ('b4000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000b', 'b3000000-0000-4000-8000-000000000001', 1);
insert into public.sections (id, user_id, chapter_id, position) values ('a5000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'a4000000-0000-4000-8000-000000000001', 1);
insert into public.section_versions (id, user_id, section_id, version_no, content, source) values
  ('a6000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'a5000000-0000-4000-8000-000000000001', 1, 'Writing A', 'manual');
update public.sections set current_version_id = 'a6000000-0000-4000-8000-000000000001' where id = 'a5000000-0000-4000-8000-000000000001';
insert into public.section_runs (section_id, user_id, book_id, run_id, state, base_version_id) values
  ('a5000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-000000000001',
   'a7000000-0000-4000-8000-000000000001', 'running', 'a6000000-0000-4000-8000-000000000001');
insert into public.section_drafts (section_id, user_id, content, base_version_id) values
  ('a5000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'Writing A, still being typed', 'a6000000-0000-4000-8000-000000000001');
insert into public.ai_usage (user_id, book_id, stage, model, input_tokens, output_tokens, status, counted) values
  ('00000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-000000000001', 'bio', 'm', 1, 1, 'ok', true);
insert into public.user_settings (user_id) values ('00000000-0000-4000-8000-00000000000a');
insert into public.outline_checks (book_id, user_id, findings, inputs_key, checked_at) values
  ('a3000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', '[]', '0123456789abcdef', now());

-- The tables under test: every table in public.
create temp table rls_tables as
  select c.relname::text as t from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by 1;
grant select on rls_tables to public;

-- A fingerprint of all of A's rows, read as the owner (no RLS).
create function pg_temp.a_digest() returns text language plpgsql security definer as $$
declare r record; acc text := ''; part text;
begin
  for r in select t from rls_tables order by t loop
    execute format('select coalesce(md5(string_agg(x::text, %L order by x::text)), %L) from public.%I x where user_id = %L',
                   ',', 'none', r.t, '00000000-0000-4000-8000-00000000000a') into part;
    acc := acc || r.t || '=' || part || ';';
  end loop;
  return md5(acc);
end $$;
grant execute on function pg_temp.a_digest() to public;
select pg_temp.a_digest() as d \gset before_

select pg_temp.chk('18 public tables (0020: section_runs)', (select count(*) from rls_tables) = 18, (select count(*) from rls_tables)::text);
select pg_temp.chk('RLS on for every public table', not exists (
  select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity));
select pg_temp.chk('A has a row in every table', (select bool_and(n > 0) from (
  select (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I where user_id = %L', t, '00000000-0000-4000-8000-00000000000a'), false, true, '')))[1]::text::int n from rls_tables) s));

-- ── As user B: read, update and delete see none of A's rows ──
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000b';
select pg_temp.chk(t || ': B reads 0 of A''s rows',
         (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I where user_id <> %L', t, '00000000-0000-4000-8000-00000000000b'), false, true, '')))[1]::text = '0')
  from rls_tables order by t;
-- outline_checks (0017) gives the browser no write privilege at all,
-- section_versions (0018) no update or delete, and section_runs (0020) no
-- delete (its update goes through RLS: 0 rows): refused, not 0 rows.
select pg_temp.expect(t || ': B updates 0 of A''s rows', format('update public.%I set user_id = user_id where user_id = %L', t, '00000000-0000-4000-8000-00000000000a'), case when t in ('outline_checks', 'section_versions') then '42501%' else 'OK 0' end)
  from rls_tables order by t;
select pg_temp.expect(t || ': B deletes 0 of A''s rows', format('delete from public.%I where user_id = %L', t, '00000000-0000-4000-8000-00000000000a'), case when t in ('outline_checks', 'section_versions', 'section_runs') then '42501%' else 'OK 0' end)
  from rls_tables order by t;

-- ── As user B: inserts with A's user id are refused ──
select pg_temp.expect('pen_names: insert as A refused', $q$insert into public.pen_names (user_id, name) values ('00000000-0000-4000-8000-00000000000a', 'X')$q$, '42501%');
select pg_temp.expect('topics: insert as A refused', $q$insert into public.topics (user_id, name) values ('00000000-0000-4000-8000-00000000000a', 'X')$q$, '42501%');
select pg_temp.expect('books: insert as A refused', $q$insert into public.books (user_id) values ('00000000-0000-4000-8000-00000000000a')$q$, '42501%');
select pg_temp.expect('ai_usage: insert as A refused', $q$insert into public.ai_usage (user_id, stage, status) values ('00000000-0000-4000-8000-00000000000a', 'bio', 'ok')$q$, '42501%');
select pg_temp.expect('ai_usage: insert as B refused (server only)', $q$insert into public.ai_usage (user_id, stage, status) values ('00000000-0000-4000-8000-00000000000b', 'bio', 'ok')$q$, '42501%');
select pg_temp.expect('user_settings: insert as A refused', $q$insert into public.user_settings (user_id) values ('00000000-0000-4000-8000-00000000000a')$q$, '42501%');

-- ── As user B: own rows under A's parent rows are refused ──
select pg_temp.expect('books: B''s book on A''s topic refused', $q$insert into public.books (topic_id) values ('a2000000-0000-4000-8000-000000000001')$q$, '42501%');
select pg_temp.expect('books: B''s book with A''s pen name refused', $q$insert into public.books (pen_name_id) values ('a1000000-0000-4000-8000-000000000001')$q$, '42501%');
select pg_temp.expect('topic_page_books: under A''s topic refused', $q$insert into public.topic_page_books (topic_id, position, title) values ('a2000000-0000-4000-8000-000000000001', 2, 'X')$q$, '42501%');
select pg_temp.expect('book_briefs: on A''s book refused', $q$insert into public.book_briefs (book_id) values ('a3000000-0000-4000-8000-000000000001')$q$, '42501%');
select pg_temp.expect('competitors: on A''s book refused', $q$insert into public.competitors (book_id, title) values ('a3000000-0000-4000-8000-000000000001', 'X')$q$, '42501%');
select pg_temp.expect('research_insights: on A''s book refused', $q$insert into public.research_insights (book_id) values ('a3000000-0000-4000-8000-000000000001')$q$, '42501%');
select pg_temp.expect('research_sources: on A''s book refused', $q$insert into public.research_sources (book_id, kind, body) values ('a3000000-0000-4000-8000-000000000001', 'note', 'X')$q$, '42501%');
select pg_temp.expect('positioning: on A''s book refused', $q$insert into public.positioning (book_id) values ('a3000000-0000-4000-8000-000000000001')$q$, '42501%');
select pg_temp.expect('title_options: on A''s book refused', $q$insert into public.title_options (book_id, title) values ('a3000000-0000-4000-8000-000000000001', 'X')$q$, '42501%');
select pg_temp.expect('chapters: on A''s book refused', $q$insert into public.chapters (book_id, position) values ('a3000000-0000-4000-8000-000000000001', 2)$q$, '42501%');
select pg_temp.expect('sections: in A''s chapter refused', $q$insert into public.sections (chapter_id, position) values ('a4000000-0000-4000-8000-000000000001', 2)$q$, '42501%');
select pg_temp.expect('section_versions: on A''s section refused', $q$insert into public.section_versions (section_id, version_no, source) values ('a5000000-0000-4000-8000-000000000001', 2, 'manual')$q$, '42501%');
select pg_temp.expect('section_runs: B cannot insert a run (server only)', $q$insert into public.section_runs (section_id, user_id, book_id, run_id, state) values ('a5000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000b', 'b3000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001', 'running')$q$, '42501%');
select pg_temp.expect('request_section_stop: B cannot stop A''s run', $q$select 1 where public.request_section_stop('a7000000-0000-4000-8000-000000000001')$q$, 'OK 0');
select pg_temp.expect('section_drafts: on A''s section refused', $q$insert into public.section_drafts (section_id, content) values ('a5000000-0000-4000-8000-000000000001', 'X')$q$, '42501%');
select pg_temp.expect('save_version: A''s section reads as not found', $q$select public.save_version('a5000000-0000-4000-8000-000000000001', 'X', 'a6000000-0000-4000-8000-000000000001')$q$, 'P0002 section_not_found%');
select pg_temp.expect('restore_version: A''s section reads as not found', $q$select public.restore_version('a5000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000001')$q$, 'P0002 section_not_found%');
select pg_temp.expect('outline_checks: on A''s book refused (server only)', $q$insert into public.outline_checks (book_id, user_id, findings, inputs_key, checked_at) values ('a3000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', '[]', '0123456789abcdef', now())$q$, '42501%');
select pg_temp.expect('approve_outline: A''s book reads as not found', $q$select public.approve_outline('a3000000-0000-4000-8000-000000000001')$q$, 'P0002 book_not_found%');
select pg_temp.expect('user_settings: B''s settings with A''s pen name refused', $q$insert into public.user_settings (default_pen_name_id) values ('a1000000-0000-4000-8000-000000000001')$q$, '42501%');

-- ── As user B: moving own rows to A is refused ──
select pg_temp.expect('books: B gives a book to A refused', $q$update public.books set user_id = '00000000-0000-4000-8000-00000000000a' where id = 'b3000000-0000-4000-8000-000000000001'$q$, '42501%');
select pg_temp.expect('books: B points a book at A''s topic refused', $q$update public.books set topic_id = 'a2000000-0000-4000-8000-000000000001' where id = 'b3000000-0000-4000-8000-000000000001'$q$, '42501%');
select pg_temp.expect('chapters: B moves a chapter to A''s book refused', $q$update public.chapters set book_id = 'a3000000-0000-4000-8000-000000000001' where id = 'b4000000-0000-4000-8000-000000000001'$q$, '42501%');

-- Control: B can still work on B's own rows (the checks above are RLS, not a broken role).
select pg_temp.expect('control: B adds a chapter to B''s book', $q$insert into public.chapters (book_id, position) values ('b3000000-0000-4000-8000-000000000001', 2)$q$, 'OK 1');
select pg_temp.expect('control: B reads B''s book', $q$select 1 from public.books where id = 'b3000000-0000-4000-8000-000000000001'$q$, 'OK 1');

-- ── anon sees nothing ──
reset role;
set role anon;
select pg_temp.chk(t || ': anon reads 0 rows',
         coalesce((xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', t), false, true, '')))[1]::text, 'denied') in ('0', 'denied'))
  from rls_tables order by t;

-- ── A's rows are unchanged ──
reset role;
select pg_temp.chk('A''s rows are unchanged in every table', pg_temp.a_digest() = :'before_d');
