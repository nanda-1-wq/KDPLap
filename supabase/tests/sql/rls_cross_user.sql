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
insert into public.section_suggestions (id, user_id, book_id, section_id, action, base_version_id, selection, output) values
  ('a8000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-000000000001',
   'a5000000-0000-4000-8000-000000000001', 'improve', 'a6000000-0000-4000-8000-000000000001', 'Writing A', 'Better writing A');
insert into public.ai_usage (user_id, book_id, stage, model, input_tokens, output_tokens, status, counted) values
  ('00000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-000000000001', 'bio', 'm', 1, 1, 'ok', true);
insert into public.user_settings (user_id) values ('00000000-0000-4000-8000-00000000000a');
insert into public.outline_checks (book_id, user_id, findings, inputs_key, checked_at) values
  ('a3000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', '[]', '0123456789abcdef', now());
insert into public.section_checks (section_id, user_id, book_id, version_id, areas, words, inputs_key, checked_at) values
  ('a5000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-000000000001',
   'a6000000-0000-4000-8000-000000000001', '{"objective": "pass", "voice": "pass", "drift": "pass"}', 2, '0123456789abcdef', now());
insert into public.kept_findings (user_id, section_id, type, message, quote) values
  ('00000000-0000-4000-8000-00000000000a', 'a5000000-0000-4000-8000-000000000001', 'drift', 'Kept A', 'Writing A');
insert into public.book_exports (user_id, book_id, format, include, parts, versions) values
  ('00000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-000000000001', 'docx', 'all',
   '{"title": true, "copyright": true, "contents": true, "intro": true, "conclusion": true, "about": false}',
   array['a6000000-0000-4000-8000-000000000001']::uuid[]);
-- 0027: A's format row (A's second book, same pen name, ticked in Also by), and B's own row.
insert into public.books (id, user_id, pen_name_id, title) values
  ('a3000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000001', 'Book A2');
insert into public.book_formats (book_id, user_id, also_by) values
  ('a3000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', array['a3000000-0000-4000-8000-000000000002']::uuid[]);
insert into public.book_formats (book_id, user_id) values ('b3000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000b');
update public.sections set status = 'final' where id = 'a5000000-0000-4000-8000-000000000001';
insert into public.book_exports (user_id, book_id, format, include, parts, versions, page_count, settings_key, engine) values
  ('00000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-000000000001', 'pdf', 'final',
   '{"title": true, "copyright": true, "contents": true, "intro": true, "conclusion": true, "about": false}',
   array['a6000000-0000-4000-8000-000000000001']::uuid[], 36, public.format_key('a3000000-0000-4000-8000-000000000001'), 'typst 0.14.2 · t1');
-- 0034: A's EPUB row.
insert into public.book_exports (user_id, book_id, format, include, parts, versions, settings_key, engine) values
  ('00000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-000000000001', 'epub', 'final',
   '{"title": true, "copyright": true, "contents": true, "intro": true, "conclusion": true, "about": false}',
   array['a6000000-0000-4000-8000-000000000001']::uuid[], public.epub_key('a3000000-0000-4000-8000-000000000001'), 'epub3 · e1');
-- 0028: A's run, Mark as OK and promise check.
insert into public.qc_runs (user_id, book_id, versions, inputs_key, results, sections, words, style) values
  ('00000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-000000000001',
   public.qc_versions('a3000000-0000-4000-8000-000000000001'), public.qc_inputs_key('a3000000-0000-4000-8000-000000000001'),
   '{"items": [], "more": {}, "sources": [], "notes": {"unsaved": 0, "running": 0}}', 1, 2, 'classic');
insert into public.qc_dismissed (id, user_id, book_id, section_id, rule, issue_key, label) values
  ('a9000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-000000000001',
   'a5000000-0000-4000-8000-000000000001', 'not_final', 'a5|a6', 'Dismissed A');
insert into public.book_checks (chapter_id, user_id, book_id, verdict, reason, quote, section_id, versions, words, inputs_key, checked_at) values
  ('a4000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-000000000001',
   'drifts', 'A new audience.', 'Writing A', 'a5000000-0000-4000-8000-000000000001',
   array['a6000000-0000-4000-8000-000000000001']::uuid[], 100, '0123456789abcdef', now());
-- 0029 and 0030: A's design (laid out for the 36-page Print PDF, 6 x 9, white), a snapshot, a ticked picture,
-- a My layout, a blurb, both exports, and A's file in the bucket. B's own design and My layout (for the move cases).
insert into public.cover_designs (book_id, user_id, fmt, layers) values
  ('a3000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', public.cover_fmt('a3000000-0000-4000-8000-000000000001'),
   '[{"id": 1, "type": "image", "asset": "ac000000-0000-4000-8000-000000000001"}]');
insert into public.cover_designs (book_id, user_id, fmt) values
  ('b3000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000b', '{"trim": "6x9", "pages": 24, "paper": "white"}');
insert into public.cover_design_history (book_id, user_id, reason, layers, bg, fmt) values
  ('a3000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'visit', '[]', '#FFFFFF', '{"trim": "6x9", "pages": 36, "paper": "white"}');
insert into public.cover_assets (id, user_id, source, mime, path, width, height, bytes, rights_at, origin_book_id) values
  ('ac000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'upload', 'image/jpeg',
   '00000000-0000-4000-8000-00000000000a/assets/ac000000-0000-4000-8000-000000000001.jpg', 1838, 2775, 900000, now(), 'a3000000-0000-4000-8000-000000000001');
insert into public.cover_my_layouts (id, user_id, name, from_book_id, fmt, bg, layers) values
  ('ad000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'Layout A', 'a3000000-0000-4000-8000-000000000001',
   '{"trim": "6x9", "pages": 36, "paper": "white"}', '#FFFFFF', '[]'),
  ('bd000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000b', 'Layout B', 'b3000000-0000-4000-8000-000000000001',
   '{"trim": "6x9", "pages": 24, "paper": "white"}', '#FFFFFF', '[]');
insert into public.cover_blurbs (user_id, book_id, body, source) values
  ('00000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-000000000001', 'Blurb A.', 'manual');
insert into public.cover_exports (user_id, book_id, kind, settings_key, engine, width_in, height_in, spine_in) values
  ('00000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-000000000001', 'print',
   public.cover_key('a3000000-0000-4000-8000-000000000001'), 'typst 0.14.2 · c1', 12.3311, 9.25, 0.0811);
insert into public.cover_exports (user_id, book_id, kind, settings_key, engine, width_px, height_px) values
  ('00000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-000000000001', 'kindle',
   public.cover_key('a3000000-0000-4000-8000-000000000001'), 'typst 0.14.2 · c1', 1600, 2560);
-- 0031: a stock search answer and a stock call of A's.
insert into public.stock_cache (user_id, key, body) values
  ('00000000-0000-4000-8000-00000000000a', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '{"results": []}');
insert into public.stock_calls (user_id, source, action, provider_calls) values
  ('00000000-0000-4000-8000-00000000000a', 'pixabay', 'search', 1);
insert into storage.objects (bucket_id, name, owner) values
  ('covers', '00000000-0000-4000-8000-00000000000a/assets/ac000000-0000-4000-8000-000000000001.jpg',
   '00000000-0000-4000-8000-00000000000a');

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

select pg_temp.chk('34 public tables (0030: cover_designs, cover_design_history, cover_assets, cover_my_layouts; book_covers and cover_images dropped; 0031: stock_cache, stock_calls)', (select count(*) from rls_tables) = 34, (select count(*) from rls_tables)::text);
select pg_temp.chk('A''s two cover exports recorded', (select count(*) from public.cover_exports) = 2);
select pg_temp.chk('A''s file is in the bucket', (select count(*) from storage.objects where bucket_id = 'covers') = 1);
select pg_temp.chk('A''s Print PDF row recorded', (select count(*) from public.book_exports where format = 'pdf') = 1);
select pg_temp.chk('(0034) A''s EPUB row recorded', (select count(*) from public.book_exports where format = 'epub') = 1);
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
-- outline_checks (0017) and section_checks (0022) give the browser no write privilege at all,
-- section_versions (0018) no update or delete, section_runs (0020) and
-- section_suggestions (0021) no delete (their update goes through RLS: 0
-- rows), kept_findings (0024) no update, book_exports (0025) no update
-- and no delete, book_formats (0027) no delete, qc_runs and book_checks
-- (0028) no update and no delete, qc_dismissed (0028) no update, and
-- cover_blurbs and cover_exports (0029) no update and no delete,
-- cover_designs (0030) no delete, cover_design_history (0030) no update and
-- no delete, cover_assets (0030) no update: refused, not 0 rows.
select pg_temp.expect(t || ': B updates 0 of A''s rows', format('update public.%I set user_id = user_id where user_id = %L', t, '00000000-0000-4000-8000-00000000000a'), case when t in ('outline_checks', 'section_checks', 'section_versions', 'kept_findings', 'book_exports', 'qc_runs', 'qc_dismissed', 'book_checks', 'cover_blurbs', 'cover_exports', 'cover_design_history', 'cover_assets', 'stock_calls') then '42501%' else 'OK 0' end)
  from rls_tables order by t;
select pg_temp.expect(t || ': B deletes 0 of A''s rows', format('delete from public.%I where user_id = %L', t, '00000000-0000-4000-8000-00000000000a'), case when t in ('outline_checks', 'section_checks', 'section_versions', 'section_runs', 'section_suggestions', 'book_exports', 'book_formats', 'qc_runs', 'book_checks', 'cover_designs', 'cover_design_history', 'cover_blurbs', 'cover_exports', 'stock_calls') then '42501%' else 'OK 0' end)
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
select pg_temp.expect('section_suggestions: B cannot insert a suggestion (server only)', $q$insert into public.section_suggestions (user_id, book_id, section_id, action, selection, output) values ('00000000-0000-4000-8000-00000000000b', 'b3000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', 'improve', 'a b c', 'a b d')$q$, '42501%');
select pg_temp.expect('section_suggestions: B cannot mark A''s suggestion used', $q$update public.section_suggestions set used_at = now() where id = 'a8000000-0000-4000-8000-000000000001'$q$, 'OK 0');
select pg_temp.expect('apply_suggestion: A''s suggestion reads as not found', $q$select public.apply_suggestion('a8000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000001', 'Better writing A')$q$, 'P0002 suggestion_not_found%');
select pg_temp.expect('section_drafts: on A''s section refused', $q$insert into public.section_drafts (section_id, content) values ('a5000000-0000-4000-8000-000000000001', 'X')$q$, '42501%');
select pg_temp.expect('save_version: A''s section reads as not found', $q$select public.save_version('a5000000-0000-4000-8000-000000000001', 'X', 'a6000000-0000-4000-8000-000000000001')$q$, 'P0002 section_not_found%');
select pg_temp.expect('restore_version: A''s section reads as not found', $q$select public.restore_version('a5000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000001')$q$, 'P0002 section_not_found%');
select pg_temp.expect('outline_checks: on A''s book refused (server only)', $q$insert into public.outline_checks (book_id, user_id, findings, inputs_key, checked_at) values ('a3000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', '[]', '0123456789abcdef', now())$q$, '42501%');
select pg_temp.expect('section_checks: on A''s section refused (server only)', $q$insert into public.section_checks (section_id, user_id, book_id, areas, words, inputs_key, checked_at) values ('a5000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-000000000001', '{"objective": "pass", "voice": "pass", "drift": "pass"}', 0, '0123456789abcdef', now())$q$, '42501%');
select pg_temp.expect('section_checks: B cannot insert a check as B (server only)', $q$insert into public.section_checks (section_id, user_id, book_id, areas, words, inputs_key, checked_at) values ('a5000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000b', 'b3000000-0000-4000-8000-000000000001', '{"objective": "pass", "voice": "pass", "drift": "pass"}', 0, '0123456789abcdef', now())$q$, '42501%');
select pg_temp.expect('kept_findings: on A''s section refused', $q$insert into public.kept_findings (section_id, type, message, quote) values ('a5000000-0000-4000-8000-000000000001', 'drift', 'X', 'Writing A')$q$, '42501%');
select pg_temp.expect('book_exports: B cannot record an export of A''s book', $q$insert into public.book_exports (book_id, format, include, parts, versions) values ('a3000000-0000-4000-8000-000000000001', 'docx', 'all', '{"title": true, "copyright": true, "contents": true, "intro": true, "conclusion": true, "about": false}', array['a6000000-0000-4000-8000-000000000001']::uuid[])$q$, '42501%');
select pg_temp.expect('export_json: A''s book reads as null', $q$select 1 where public.export_json('a3000000-0000-4000-8000-000000000001') is null$q$, 'OK 1');
select pg_temp.expect('export_badges: none of A''s books', $q$select 1 from public.export_badges() where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, 'OK 0');
select pg_temp.expect('usage_month: none of A''s tokens', $q$select 1 where (public.usage_month() ->> 'tokens')::int = 0$q$, 'OK 1');
select pg_temp.expect('user_settings: B cannot set A''s display name', $q$update public.user_settings set display_name = 'B' where user_id = '00000000-0000-4000-8000-00000000000a'$q$, 'OK 0');
select pg_temp.expect('approve_outline: A''s book reads as not found', $q$select public.approve_outline('a3000000-0000-4000-8000-000000000001')$q$, 'P0002 book_not_found%');
select pg_temp.expect('complete_book: A''s book reads as not found', $q$select public.complete_book('a3000000-0000-4000-8000-000000000001')$q$, 'P0002 book_not_found%');
select pg_temp.expect('books: B cannot reopen A''s book', $q$update public.books set status = 'in_progress' where id = 'a3000000-0000-4000-8000-000000000001'$q$, 'OK 0');
select pg_temp.expect('books: B cannot touch A''s completed_at', $q$update public.books set completed_at = null where id = 'a3000000-0000-4000-8000-000000000001'$q$, 'OK 0');
select pg_temp.expect('words_month: none of A''s words', $q$select 1 where (public.words_month() ->> 'words')::int = 0$q$, 'OK 1');
select pg_temp.expect('book_formats: on A''s book refused', $q$insert into public.book_formats (book_id) values ('a3000000-0000-4000-8000-000000000002')$q$, '42501%');
select pg_temp.expect('book_formats: B cannot tick A''s book in Also by', $q$update public.book_formats set also_by = array['a3000000-0000-4000-8000-000000000002']::uuid[] where book_id = 'b3000000-0000-4000-8000-000000000001'$q$, 'P0001 also_by_not_allowed%');
select pg_temp.expect('book_formats: B cannot move B''s row to A''s book', $q$update public.book_formats set book_id = 'a3000000-0000-4000-8000-000000000002' where book_id = 'b3000000-0000-4000-8000-000000000001'$q$, 'P0001 format_fixed%');
select pg_temp.expect('book_exports: B cannot record a Print PDF of A''s book', $q$insert into public.book_exports (book_id, format, include, parts, versions, page_count, settings_key, engine) values ('a3000000-0000-4000-8000-000000000001', 'pdf', 'final', '{"title": true, "copyright": true, "contents": true, "intro": true, "conclusion": true, "about": false}', array['a6000000-0000-4000-8000-000000000001']::uuid[], 36, '0123456789abcdef0123456789abcdef', 'typst 0.14.2 · t1')$q$, '42501%');
select pg_temp.expect('format_json: A''s book reads as null', $q$select 1 where public.format_json('a3000000-0000-4000-8000-000000000001') is null$q$, 'OK 1');
select pg_temp.expect('format_key: A''s book reads as null', $q$select 1 where public.format_key('a3000000-0000-4000-8000-000000000001') is null$q$, 'OK 1');
select pg_temp.expect('pdf_marks: none of A''s books', $q$select 1 from public.pdf_marks() where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, 'OK 0');
select pg_temp.expect('pdf_marks(A''s book): no row', $q$select 1 from public.pdf_marks('a3000000-0000-4000-8000-000000000001')$q$, 'OK 0');
select pg_temp.expect('(0034) book_exports: B reads none of A''s EPUB rows', $q$select 1 from public.book_exports where format = 'epub'$q$, 'OK 0');
select pg_temp.expect('(0034) book_exports: B cannot record an EPUB of A''s book', $q$insert into public.book_exports (book_id, format, include, parts, versions, settings_key, engine) values ('a3000000-0000-4000-8000-000000000001', 'epub', 'final', '{"title": true, "copyright": true, "contents": true, "intro": true, "conclusion": true, "about": false}', array['a6000000-0000-4000-8000-000000000001']::uuid[], md5('x'), 'epub3 · e1')$q$, '42501%');
select pg_temp.expect('(0034) book_exports: B cannot put A''s version in an EPUB of B''s book', $q$insert into public.book_exports (book_id, format, include, parts, versions, settings_key, engine) values ('b3000000-0000-4000-8000-000000000001', 'epub', 'final', '{"title": true, "copyright": true, "contents": true, "intro": true, "conclusion": true, "about": false}', array['a6000000-0000-4000-8000-000000000001']::uuid[], public.epub_key('b3000000-0000-4000-8000-000000000001'), 'epub3 · e1')$q$, 'P0001 export_version_not_in_book%');
select pg_temp.expect('(0034) epub_key: A''s book reads as null', $q$select 1 where public.epub_key('a3000000-0000-4000-8000-000000000001') is null$q$, 'OK 1');
select pg_temp.expect('(0034) epub_marks: none of A''s books', $q$select 1 from public.epub_marks() where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, 'OK 0');
select pg_temp.expect('(0034) epub_marks(A''s book): no row', $q$select 1 from public.epub_marks('a3000000-0000-4000-8000-000000000001')$q$, 'OK 0');
select pg_temp.expect('(0034) format_json: A''s book reads as null (no epub_key, no last_epub)', $q$select 1 where public.format_json('a3000000-0000-4000-8000-000000000001') is null$q$, 'OK 1');
select pg_temp.expect('pdf_version_ids: none of A''s versions', $q$select 1 where public.pdf_version_ids('a3000000-0000-4000-8000-000000000001') = '{}'::uuid[]$q$, 'OK 1');
select pg_temp.expect('also_by_valid: none of A''s ticks', $q$select 1 where public.also_by_valid('a3000000-0000-4000-8000-000000000001') = '{}'::uuid[]$q$, 'OK 1');
select pg_temp.expect('qc_runs: B cannot record a run of A''s book', $q$insert into public.qc_runs (book_id, versions, inputs_key, results, sections, words, style) values ('a3000000-0000-4000-8000-000000000001', array['a6000000-0000-4000-8000-000000000001']::uuid[], '0123456789abcdef0123456789abcdef', '{"items": [], "more": {}, "sources": [], "notes": {"unsaved": 0, "running": 0}}', 1, 2, 'classic')$q$, '42501%');
select pg_temp.expect('qc_runs: B''s book with A''s version list is stale', $q$insert into public.qc_runs (book_id, versions, inputs_key, results, sections, words, style) values ('b3000000-0000-4000-8000-000000000001', array['a6000000-0000-4000-8000-000000000001']::uuid[], '0123456789abcdef0123456789abcdef', '{"items": [], "more": {}, "sources": [], "notes": {"unsaved": 0, "running": 0}}', 1, 2, 'classic')$q$, 'P0001 qc_stale%');
select pg_temp.expect('qc_dismissed: on A''s book refused', $q$insert into public.qc_dismissed (book_id, rule, issue_key, label) values ('a3000000-0000-4000-8000-000000000001', 'length', 'length', 'X')$q$, '42501%');
select pg_temp.expect('qc_dismissed: A''s section on B''s book refused', $q$insert into public.qc_dismissed (book_id, section_id, rule, issue_key, label) values ('b3000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', 'length', 'length', 'X')$q$, 'P0001 qc_dismissed_section%');
select pg_temp.expect('qc_dismissed: B cannot undo A''s row', $q$delete from public.qc_dismissed where id = 'a9000000-0000-4000-8000-000000000001'$q$, 'OK 0');
select pg_temp.expect('book_checks: on A''s chapter refused (server only)', $q$insert into public.book_checks (chapter_id, user_id, book_id, verdict, reason, quote, versions, words, inputs_key, checked_at) values ('a4000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-000000000001', 'keeps', 'X', '', array['a6000000-0000-4000-8000-000000000001']::uuid[], 100, '0123456789abcdef', now())$q$, '42501%');
select pg_temp.expect('book_checks: B cannot insert a check as B (server only)', $q$insert into public.book_checks (chapter_id, user_id, book_id, verdict, reason, quote, versions, words, inputs_key, checked_at) values ('b4000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000b', 'b3000000-0000-4000-8000-000000000001', 'keeps', 'X', '', array['a6000000-0000-4000-8000-000000000001']::uuid[], 100, '0123456789abcdef', now())$q$, '42501%');
select pg_temp.expect('qc_json: A''s book reads as null', $q$select 1 where public.qc_json('a3000000-0000-4000-8000-000000000001') is null$q$, 'OK 1');
select pg_temp.expect('qc_inputs_key: A''s book reads as null', $q$select 1 where public.qc_inputs_key('a3000000-0000-4000-8000-000000000001') is null$q$, 'OK 1');
select pg_temp.expect('qc_versions: none of A''s versions', $q$select 1 where public.qc_versions('a3000000-0000-4000-8000-000000000001') = '{}'::uuid[]$q$, 'OK 1');
select pg_temp.expect('qc_mark: no row for A''s book', $q$select 1 from public.qc_mark('a3000000-0000-4000-8000-000000000001')$q$, 'OK 0');
select pg_temp.expect('user_settings: B''s settings with A''s pen name refused', $q$insert into public.user_settings (default_pen_name_id) values ('a1000000-0000-4000-8000-000000000001')$q$, '42501%');
-- 0029 and 0030: 09 Cover.
select pg_temp.expect('cover_designs: B cannot add a design to A''s book', $q$insert into public.cover_designs (book_id, fmt) values ('a3000000-0000-4000-8000-000000000002', '{"trim": "6x9", "pages": 24, "paper": "white"}')$q$, '42501%');
select pg_temp.expect('cover_designs: B cannot change A''s design', $q$update public.cover_designs set bg = '#000000' where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, 'OK 0');
select pg_temp.expect('cover_designs: B''s autosave with A''s rev saves 0 rows', $q$update public.cover_designs set layers = '[]' where book_id = 'a3000000-0000-4000-8000-000000000001' and rev = 1$q$, 'OK 0');
select pg_temp.expect('cover_designs: B cannot move B''s design to A''s book', $q$update public.cover_designs set book_id = 'a3000000-0000-4000-8000-000000000002' where book_id = 'b3000000-0000-4000-8000-000000000001'$q$, 'P0001 cover_fixed%');
select pg_temp.expect('cover_designs: B cannot give B''s design to A', $q$update public.cover_designs set user_id = '00000000-0000-4000-8000-00000000000a' where book_id = 'b3000000-0000-4000-8000-000000000001'$q$, 'P0001 cover_fixed%');
select pg_temp.expect('cover_designs control: B autosaves B''s own design', $q$update public.cover_designs set bg = '#000000' where book_id = 'b3000000-0000-4000-8000-000000000001' and rev = 1$q$, 'OK 1');
select pg_temp.expect('cover_design_history: B cannot add a snapshot of A''s book', $q$insert into public.cover_design_history (book_id, reason, layers, bg, fmt) values ('a3000000-0000-4000-8000-000000000001', 'visit', '[]', '#FFFFFF', '{"trim": "6x9", "pages": 36, "paper": "white"}')$q$, '42501%');
-- (The guard runs before the policy's check: B's own book with A's user id stops at "cover_owner".)
select pg_temp.expect('cover_design_history: B cannot add a snapshot with A''s user id', $q$insert into public.cover_design_history (book_id, user_id, reason, layers, bg, fmt) values ('b3000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'visit', '[]', '#FFFFFF', '{"trim": "6x9", "pages": 24, "paper": "white"}')$q$, 'P0001 cover_owner%');
select pg_temp.expect('cover_assets: B cannot add a picture with A''s user id', $q$insert into public.cover_assets (id, user_id, source, mime, path, width, height, bytes, rights_at) values ('bc000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'upload', 'image/jpeg', '00000000-0000-4000-8000-00000000000a/assets/bc000000-0000-4000-8000-000000000001.jpg', 10, 10, 10, now())$q$, '42501%');
select pg_temp.expect('cover_assets: B cannot name a file in A''s folder', $q$insert into public.cover_assets (id, source, mime, path, width, height, bytes, rights_at) values ('bc000000-0000-4000-8000-000000000001', 'upload', 'image/jpeg', '00000000-0000-4000-8000-00000000000a/assets/bc000000-0000-4000-8000-000000000001.jpg', 10, 10, 10, now())$q$, '23514%');
select pg_temp.expect('cover_assets: B cannot set A''s book as the origin', $q$insert into public.cover_assets (id, source, mime, path, width, height, bytes, rights_at, origin_book_id) values ('bc000000-0000-4000-8000-000000000001', 'upload', 'image/jpeg', '00000000-0000-4000-8000-00000000000b/assets/bc000000-0000-4000-8000-000000000001.jpg', 10, 10, 10, now(), 'a3000000-0000-4000-8000-000000000001')$q$, '42501%');
select pg_temp.expect('cover_assets: B cannot remove A''s picture', $q$delete from public.cover_assets where id = 'ac000000-0000-4000-8000-000000000001'$q$, 'OK 0');
select pg_temp.expect('cover_assets control: B adds B''s own picture', $q$insert into public.cover_assets (id, source, mime, path, width, height, bytes, rights_at) values ('bc000000-0000-4000-8000-000000000001', 'upload', 'image/jpeg', '00000000-0000-4000-8000-00000000000b/assets/bc000000-0000-4000-8000-000000000001.jpg', 10, 10, 10, now())$q$, 'OK 1');
select pg_temp.expect('cover_my_layouts: B cannot save a layout from A''s book', $q$insert into public.cover_my_layouts (name, from_book_id, fmt, bg, layers) values ('X', 'a3000000-0000-4000-8000-000000000001', '{"trim": "6x9", "pages": 36, "paper": "white"}', '#FFFFFF', '[]')$q$, '42501%');
select pg_temp.expect('(0032) cover_my_layouts: B''s insert with A''s user id from A''s book refused (no upsert now; the trim never reaches A''s rows)', $q$insert into public.cover_my_layouts (user_id, name, from_book_id, fmt, bg, layers) values ('00000000-0000-4000-8000-00000000000a', 'X', 'a3000000-0000-4000-8000-000000000001', '{"trim": "6x9", "pages": 36, "paper": "white"}', '#FFFFFF', '[]')$q$, '42501%');
select pg_temp.expect('cover_my_layouts: B cannot rename A''s layout', $q$update public.cover_my_layouts set name = 'Mine' where id = 'ad000000-0000-4000-8000-000000000001'$q$, 'OK 0');
select pg_temp.expect('cover_my_layouts: B cannot remove A''s layout', $q$delete from public.cover_my_layouts where id = 'ad000000-0000-4000-8000-000000000001'$q$, 'OK 0');
select pg_temp.expect('cover_my_layouts: B cannot move B''s layout to A''s book', $q$update public.cover_my_layouts set from_book_id = 'a3000000-0000-4000-8000-000000000001' where id = 'bd000000-0000-4000-8000-000000000001'$q$, 'P0001 my_layout_fixed%');
select pg_temp.expect('cover_my_layouts: B cannot give B''s layout to A', $q$update public.cover_my_layouts set user_id = '00000000-0000-4000-8000-00000000000a' where id = 'bd000000-0000-4000-8000-000000000001'$q$, 'P0001 my_layout_fixed%');
select pg_temp.expect('cover_blurbs: B cannot add a blurb to A''s book', $q$insert into public.cover_blurbs (book_id, body, source) values ('a3000000-0000-4000-8000-000000000001', 'x', 'manual')$q$, '42501%');
select pg_temp.expect('cover_exports: B cannot record a cover of A''s book', $q$insert into public.cover_exports (book_id, kind, settings_key, engine, width_px, height_px) values ('a3000000-0000-4000-8000-000000000001', 'kindle', '0123456789abcdef0123456789abcdef', 'e', 1600, 2560)$q$, '42501%');
select pg_temp.expect('cover_exports: B cannot record a full image of A''s book', $q$insert into public.cover_exports (book_id, kind, settings_key, engine, width_px, height_px) values ('a3000000-0000-4000-8000-000000000001', 'image', '0123456789abcdef0123456789abcdef', 'e', 3700, 2775)$q$, '42501%');
select pg_temp.expect('cover_json: A''s book reads as null', $q$select 1 where public.cover_json('a3000000-0000-4000-8000-000000000001') is null$q$, 'OK 1');
select pg_temp.expect('cover_key: A''s book reads as null', $q$select 1 where public.cover_key('a3000000-0000-4000-8000-000000000001') is null$q$, 'OK 1');
select pg_temp.expect('cover_fmt: A''s book reads as null', $q$select 1 where public.cover_fmt('a3000000-0000-4000-8000-000000000001') is null$q$, 'OK 1');
select pg_temp.expect('cover_pdf: no row for A''s book', $q$select 1 from public.cover_pdf('a3000000-0000-4000-8000-000000000001')$q$, 'OK 0');
select pg_temp.expect('cover_marks: none of A''s books', $q$select 1 from public.cover_marks() where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, 'OK 0');
select pg_temp.expect('cover_marks(A''s book): no row', $q$select 1 from public.cover_marks('a3000000-0000-4000-8000-000000000001')$q$, 'OK 0');
select pg_temp.expect('cover_json control: B''s own book lists only B''s My layout, none of A''s pictures', $q$select 1 where jsonb_array_length(public.cover_json('b3000000-0000-4000-8000-000000000001') -> 'my_layouts') = 1
  and public.cover_json('b3000000-0000-4000-8000-000000000001') -> 'my_layouts' -> 0 ->> 'name' = 'Layout B'$q$, 'OK 1');
-- Storage: the "covers" bucket (0030 rule: <user id>/assets/<id>.jpg|png).
select pg_temp.expect('storage: B reads none of A''s files', $q$select 1 from storage.objects where bucket_id = 'covers'$q$, 'OK 0');
select pg_temp.expect('storage: B cannot delete A''s file', $q$delete from storage.objects where bucket_id = 'covers'$q$, 'OK 0');
select pg_temp.expect('storage: B cannot rename A''s file', $q$update storage.objects set name = 'x' where bucket_id = 'covers'$q$, 'OK 0');
select pg_temp.expect('storage: B cannot upload to A''s folder', $q$insert into storage.objects (bucket_id, name) values ('covers', '00000000-0000-4000-8000-00000000000a/assets/bc000000-0000-4000-8000-000000000003.jpg')$q$, '42501%');
select pg_temp.expect('storage: B cannot use the old book path, even in B''s folder', $q$insert into storage.objects (bucket_id, name) values ('covers', '00000000-0000-4000-8000-00000000000b/b3000000-0000-4000-8000-000000000001/bc000000-0000-4000-8000-000000000003.jpg')$q$, '42501%');
select pg_temp.expect('storage control: B uploads to B''s own assets folder', $q$insert into storage.objects (bucket_id, name) values ('covers', '00000000-0000-4000-8000-00000000000b/assets/bc000000-0000-4000-8000-000000000003.png')$q$, 'OK 1');
select pg_temp.expect('storage control: B reads only B''s file', $q$select 1 from storage.objects where bucket_id = 'covers'$q$, 'OK 1');

-- 0031: B cannot write stock rows as A. (0033) B cannot insert stock_calls at all, stock_usage is gone,
-- and stock_reserve writes only B's own row.
select pg_temp.expect('stock_cache: B cannot add an answer with A''s user id', $q$insert into public.stock_cache (user_id, key, body) values ('00000000-0000-4000-8000-00000000000a', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', '{}')$q$, '42501%');
select pg_temp.expect('stock_cache: B cannot overwrite A''s answer by upsert', $q$insert into public.stock_cache (key, body) values ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '{"b": 1}') on conflict (user_id, key) do update set body = excluded.body$q$, 'OK 1');
select pg_temp.expect('(0033) stock_calls: B cannot log a call with A''s user id (no insert right)', $q$insert into public.stock_calls (user_id, source, action, provider_calls) values ('00000000-0000-4000-8000-00000000000a', 'unsplash', 'pick', 2)$q$, '42501 permission denied%');
select pg_temp.expect('(0033) stock_calls: B cannot log its own call by hand either', $q$insert into public.stock_calls (source, action, provider_calls) values ('pixabay', 'search', 1)$q$, '42501 permission denied%');
select pg_temp.expect('(0033) stock_usage is gone', $q$select public.stock_usage()$q$, '42883%');
select pg_temp.chk('(0033) B logs a call through stock_reserve', (public.stock_reserve('pixabay', 'search', 1::smallint) ->> 'ok') = 'true');
select pg_temp.chk('(0033) …the row is B''s own: B sees it and none of A''s', (select count(*) = 1 and bool_and(user_id = '00000000-0000-4000-8000-00000000000b') from public.stock_calls),
  (select count(*)::text from public.stock_calls));

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
select pg_temp.expect('storage: anon reads no file', $q$select 1 from storage.objects$q$, 'OK 0');
select pg_temp.expect('storage: anon cannot upload', $q$insert into storage.objects (bucket_id, name) values ('covers', '00000000-0000-4000-8000-00000000000a/assets/bc000000-0000-4000-8000-000000000004.jpg')$q$, '42501%');
select pg_temp.expect('storage: anon cannot delete', $q$delete from storage.objects$q$, 'OK 0');
select pg_temp.expect('cover_json: anon refused', $q$select public.cover_json('a3000000-0000-4000-8000-000000000001')$q$, '42501%');
select pg_temp.expect('(0034) epub_key: anon refused', $q$select public.epub_key('a3000000-0000-4000-8000-000000000001')$q$, '42501%');
select pg_temp.expect('(0034) epub_marks: anon refused', $q$select * from public.epub_marks()$q$, '42501%');

-- ── A's rows are unchanged ──
reset role;
select pg_temp.chk('A''s rows are unchanged in every table', pg_temp.a_digest() = :'before_d');
select pg_temp.chk('A''s file is still in the bucket, unchanged', (select count(*) from storage.objects where bucket_id = 'covers' and name like '00000000-0000-4000-8000-00000000000a/%'
  and name = '00000000-0000-4000-8000-00000000000a/assets/ac000000-0000-4000-8000-000000000001.jpg') = 1);
select pg_temp.chk('A''s picture and its rights tick are still there', (select rights_at is not null from public.cover_assets where id = 'ac000000-0000-4000-8000-000000000001'));
select pg_temp.chk('A''s design is still at rev 1', (select rev from public.cover_designs where book_id = 'a3000000-0000-4000-8000-000000000001') = 1);
