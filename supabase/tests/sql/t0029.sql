-- 0029 09 Cover (E15 Part 1), what is left after 0030 (E16 Part 3): the
-- kept shapes and their grants (F6, F8), cover_blurbs (shape, RLS, versions,
-- the 20 kept), cover_pdf, and the privileges of cover_exports. 0030 dropped
-- book_covers, cover_images, cover_book_key and cover_key(uuid, text) and
-- replaced cover_trim_ok (6 trims), the export guard, cover_marks, cover_json
-- and the storage insert rule: t0030.sql tests those.
-- Run: supabase/tests/sql/run.sh t0029.sql
\ir helpers.sql

\set A '''00000000-0000-4000-8000-00000000000a'''
\set B '''00000000-0000-4000-8000-00000000000b'''
\set ASA 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-4000-8000-00000000000a'';'
\set ASB 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-4000-8000-00000000000b'';'
\set ANON 'reset request.jwt.claim.sub; set role anon;'
\set OWNER 'reset role; reset request.jwt.claim.sub;'
\set P1 '''e0000000-0000-4000-8000-000000000001'''
\set PB '''e0000000-0000-4000-8000-00000000000b'''
\set BOOK1 '''b0000000-0000-4000-8000-000000000001'''
\set BOOK2 '''b0000000-0000-4000-8000-000000000002'''
\set BOOK3 '''b0000000-0000-4000-8000-000000000003'''
\set BOOK4 '''b0000000-0000-4000-8000-000000000004'''
\set BOOK5 '''b0000000-0000-4000-8000-000000000005'''
\set BOOKB '''b0000000-0000-4000-8000-00000000000b'''

-- ── Seed (as the owner of the database: no RLS) ──
insert into auth.users values (:A), (:B);
insert into public.pen_names (id, user_id, name, bio_text) values
  (:P1, :A, 'Nora Hale', 'Nora teaches adults. She lives in Leeds.'), (:PB, :B, 'Pen B', null);
insert into public.books (id, user_id, pen_name_id, title, subtitle) values
  (:BOOK1, :A, :P1, 'Chair Yoga for Seniors', 'Gentle moves'),
  (:BOOK2, :A, :P1, 'Second Book', null),
  (:BOOK3, :A, null, 'No Format Book', null),
  (:BOOK4, :A, :P1, 'Fourth Book', null),
  (:BOOK5, :A, :P1, 'No Brief Book', null),
  (:BOOKB, :B, :PB, 'B Book', null);
insert into public.book_briefs (book_id, user_id, trim_size) values
  (:BOOK1, :A, '6x9'), (:BOOK2, :A, '6x9'), (:BOOK3, :A, '6x9'), (:BOOK4, :A, '6x9'), (:BOOK5, :A, '6x9'), (:BOOKB, :B, '6x9');
insert into public.book_formats (book_id, user_id) values (:BOOK1, :A), (:BOOK2, :A), (:BOOK4, :A), (:BOOK5, :A), (:BOOKB, :B);

-- pg_temp.is(name, got, pattern): one result line for a value computed once
-- (the helpers below write rows, so a check never calls them twice).
create function pg_temp.is(name text, got text, want text) returns text language sql as $$
  select pg_temp.chk(name, got like want, got) $$;

-- One Final section with text per book (a Print PDF needs one).
create function pg_temp.give_text(b uuid) returns void language plpgsql as $$
declare u uuid; c uuid; s uuid; v uuid;
begin
  select user_id into u from public.books where id = b;
  insert into public.chapters (user_id, book_id, position, kind, title) values (u, b, 1, 'chapter', 'One') returning id into c;
  insert into public.sections (user_id, chapter_id, position, title, status) values (u, c, 1, 'Start', 'final') returning id into s;
  insert into public.section_versions (user_id, section_id, version_no, content, source) values (u, s, 1, 'Some text.', 'manual') returning id into v;
  update public.sections set current_version_id = v where id = s;
end $$;
select pg_temp.give_text(id) from public.books order by id;

-- A Print PDF of a book, as the current role (today's format_key and Final list).
create function pg_temp.pdf(b uuid, pages int) returns text language plpgsql as $$
begin
  return pg_temp.err(format($f$insert into public.book_exports (user_id, book_id, format, include, parts, versions, page_count, settings_key, engine)
    values (%L, %L, 'pdf', 'final', '{"title": true, "copyright": true, "contents": true, "intro": true, "conclusion": true, "about": false}',
            public.pdf_version_ids(%L), %s, public.format_key(%L), 'typst 0.14.2 · t1')$f$,
    (select user_id from public.books where id = b), b, b, pages, b));
end $$;

grant execute on all functions in schema pg_temp to public;

-- A's first Print PDF of BOOK1 (54 pages, the real book's numbers), as the owner.
select pg_temp.is('seed: BOOK1 Print PDF, 54 pages', pg_temp.pdf(:BOOK1, 54), 'OK 1');

-- ── 1. Shapes kept from 0029 (cover_trim_ok now takes 6 trims: t0030) ──
select pg_temp.chk('hex: #1F3A5F ok', public.cover_hex_ok('#1F3A5F'));
select pg_temp.chk('hex: lower case, short, no # and null refused',
  not public.cover_hex_ok('#1f3a5f') and not public.cover_hex_ok('#1F3A5') and not public.cover_hex_ok('1F3A5F') and not public.cover_hex_ok(null));
select pg_temp.chk('recent: 0 to 5 distinct colors', public.cover_recent_ok('{}') and public.cover_recent_ok(array['#111111', '#222222', '#333333', '#444444', '#555555']));
select pg_temp.chk('recent: 6, a repeat, a null, a bad color, null refused',
  not public.cover_recent_ok(array['#111111', '#222222', '#333333', '#444444', '#555555', '#666666'])
  and not public.cover_recent_ok(array['#111111', '#111111']) and not public.cover_recent_ok(array['#111111', null])
  and not public.cover_recent_ok(array['red']) and not public.cover_recent_ok(null));
select pg_temp.chk('words: one space between words', public.cover_words(E'  a \n b\tc ') = 'a b c' and public.cover_words(null) = '');
select pg_temp.chk('paper: cream, else white (F2)',
  public.cover_paper('cream') = 'cream' and public.cover_paper('white') = 'white' and public.cover_paper(null) = 'white' and public.cover_paper('x') = 'white');

-- ── 2. Grants (F6, F8) of the kept functions ──
create temp table cover_fns (f text);
insert into cover_fns values ('public.cover_hex_ok(text)'), ('public.cover_recent_ok(text[])'), ('public.cover_words(text)'),
  ('public.cover_paper(text)'), ('public.cover_pdf(uuid)');
grant select on cover_fns to public;
select pg_temp.chk(f || ': anon cannot execute', not has_function_privilege('anon', f, 'execute')) from cover_fns order by f;
select pg_temp.chk(f || ': authenticated can execute', has_function_privilege('authenticated', f, 'execute')) from cover_fns order by f;
select pg_temp.chk(f || ': no grant to PUBLIC', not exists (
    select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
     where p.oid = f::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'))
  from cover_fns order by f;
select pg_temp.chk(f || ': an explicit grant to authenticated', exists (
    select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
     where p.oid = f::regprocedure and a.grantee = 'authenticated'::regrole and a.privilege_type = 'EXECUTE'))
  from cover_fns order by f;
select pg_temp.chk(g || ': no one runs the guard', not has_function_privilege('authenticated', g, 'execute') and not has_function_privilege('anon', g, 'execute'))
  from unnest(array['public.cover_blurbs_guard()', 'public.cover_exports_guard()']) g order by g;

-- ── 3. Tables: RLS, policies, privileges ──
select pg_temp.chk(t || ': RLS on', (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass))
  from unnest(array['cover_blurbs', 'cover_exports']) t order by t;
select pg_temp.chk('policies: cover_blurbs and cover_exports select, insert',
  (select array_agg(cmd::text order by cmd) from pg_policies where tablename = 'cover_blurbs') = array['INSERT', 'SELECT']
  and (select array_agg(cmd::text order by cmd) from pg_policies where tablename = 'cover_exports') = array['INSERT', 'SELECT']);
select pg_temp.chk('authenticated: no update or delete on cover_blurbs and cover_exports',
  not has_table_privilege('authenticated', 'public.cover_blurbs', 'update') and not has_table_privilege('authenticated', 'public.cover_blurbs', 'delete')
  and not has_table_privilege('authenticated', 'public.cover_exports', 'update') and not has_table_privilege('authenticated', 'public.cover_exports', 'delete'));

-- ── 4. cover_blurbs as A ──
:ASA
select pg_temp.expect('an empty blurb refused (F6)', $q$insert into public.cover_blurbs (book_id, body, source) values ('b0000000-0000-4000-8000-000000000001', '', 'manual')$q$, '23514%');
select pg_temp.expect('a blurb with a space at the end refused', $q$insert into public.cover_blurbs (book_id, body, source) values ('b0000000-0000-4000-8000-000000000001', 'Hi ', 'manual')$q$, '23514%');
select pg_temp.expect('1,501 characters refused', $q$insert into public.cover_blurbs (book_id, body, source) values ('b0000000-0000-4000-8000-000000000001', repeat('x', 1501), 'manual')$q$, '23514%');
select pg_temp.expect('source "robot" refused', $q$insert into public.cover_blurbs (book_id, body, source) values ('b0000000-0000-4000-8000-000000000001', 'x', 'robot')$q$, '23514%');
select pg_temp.expect('a blurb of 1 character', $q$insert into public.cover_blurbs (book_id, body, source) values ('b0000000-0000-4000-8000-000000000001', 'x', 'manual')$q$, 'OK 1');
select pg_temp.expect('an AI blurb', $q$insert into public.cover_blurbs (book_id, body, source, created_at) values ('b0000000-0000-4000-8000-000000000001', 'From the AI.', 'ai', '2001-01-01')$q$, 'OK 1');
select pg_temp.chk('created_at is the server clock', (select max(created_at) from public.cover_blurbs) > now() - interval '1 minute'
  and not exists (select 1 from public.cover_blurbs where created_at < '2020-01-01'));
select pg_temp.expect('a blurb cannot change', $q$update public.cover_blurbs set body = 'y'$q$, '42501%');
select pg_temp.expect('a blurb cannot be deleted', $q$delete from public.cover_blurbs$q$, '42501%');
select pg_temp.expect('a blurb on B''s book refused', $q$insert into public.cover_blurbs (book_id, body, source) values ('b0000000-0000-4000-8000-00000000000b', 'x', 'manual')$q$, '42501%');
-- 22 saves, each its own statement (its own transaction and server time), as the app sends them.
\o /dev/null
select format($f$insert into public.cover_blurbs (book_id, body, source) values ('b0000000-0000-4000-8000-000000000002', 'Version %s', 'manual')$f$, n)
  from generate_series(1, 22) n order by n \gexec
\o
select pg_temp.chk('20 versions kept per book', (select count(*) from public.cover_blurbs where book_id = 'b0000000-0000-4000-8000-000000000002') = 20,
  (select count(*) from public.cover_blurbs where book_id = 'b0000000-0000-4000-8000-000000000002')::text);
select pg_temp.chk('the newest is kept, the oldest went', exists (select 1 from public.cover_blurbs where body = 'Version 22')
  and not exists (select 1 from public.cover_blurbs where body in ('Version 1', 'Version 2')));
select pg_temp.chk('BOOK1''s versions are untouched', (select count(*) from public.cover_blurbs where book_id = 'b0000000-0000-4000-8000-000000000001') = 2);

-- ── 5. cover_pdf ──
select pg_temp.chk('cover_pdf: BOOK1''s last Print PDF, 54 pages, current',
  (select page_count = 54 and current and export_id is not null from public.cover_pdf(:BOOK1)));
select pg_temp.chk('cover_pdf: no row before the first Print PDF (BOOK2)', not exists (select 1 from public.cover_pdf(:BOOK2)));
update public.book_formats set drop_cap = true where book_id = :BOOK1;
select pg_temp.chk('cover_pdf: a format change makes it not current', not (select current from public.cover_pdf(:BOOK1)));
update public.book_formats set paper = 'cream', drop_cap = false where book_id = :BOOK1;
select pg_temp.chk('cover_pdf: paper is not in format_key, so it is current again', (select current from public.cover_pdf(:BOOK1)));
select pg_temp.chk('cover_pdf: no row for B''s book', not exists (select 1 from public.cover_pdf(:BOOKB)));

-- ── 6. anon: every kept function and table refused ──
:ANON
select pg_temp.expect(f || ': anon refused', format('select %s', replace(replace(replace(f, '(uuid)', '(null::uuid)'), '(text[])', '(null::text[])'), '(text)', '(null::text)')), '42501%')
  from cover_fns order by f;
select pg_temp.chk(t || ': anon reads nothing', pg_temp.err(format('select 1 from public.%I', t)) = 'OK 0' or pg_temp.err(format('select 1 from public.%I', t)) like '42501%',
                   pg_temp.err(format('select 1 from public.%I', t)))
  from unnest(array['cover_blurbs', 'cover_exports']) t order by t;
:OWNER
