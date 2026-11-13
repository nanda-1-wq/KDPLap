-- 0029 09 Cover (E15 Part 1): the shapes and their grants (F6, F8), the
-- four tables (shape, RLS, privileges), the guards (fixed fields and source
-- F7, owner, picture kind and book, title breaks, the rights clock, blurb
-- versions and the 20 kept), the keys (what moves them and what does not),
-- the export guard (no cover, no or stale Print PDF, stale key, front and
-- Kindle rights F3, null and bad trim F2, the size for every group A trim
-- and paper, kindle 1600 x 2560, fields set by the server, 20 kept),
-- cover_marks, cover_json (F2 paper rule, F7 source) and the storage bucket
-- and policies (A's own folder only).
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
  (:BOOK4, :A, :P1, 'No Cover Book', null),
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

-- A print cover export of a book, as the current role: today's key and the
-- size computed here from trim, paper and the current Print PDF (or the given width).
-- extra: more columns and values, for the table checks ('width_px, height_px', '1600, 2560').
create function pg_temp.cover_print(b uuid, w numeric default null, k text default null, xcols text default null, xvals text default null) returns text language plpgsql as $$
declare t text; p text; n int; r numeric; tw numeric; th numeric;
begin
  select br.trim_size into t from public.book_briefs br where br.book_id = b;
  select f.paper into p from public.book_formats f where f.book_id = b;
  p := public.cover_paper(p);
  select c.page_count into n from public.cover_pdf(b) c;
  r := case when p = 'cream' then 0.0025 else 0.002252 end;
  tw := coalesce(nullif(split_part(coalesce(t, ''), 'x', 1), '')::numeric, 6);
  th := coalesce(nullif(split_part(coalesce(t, ''), 'x', 2), '')::numeric, 9);
  return pg_temp.err(format($f$insert into public.cover_exports (user_id, book_id, kind, settings_key, engine, width_in, height_in, spine_in, page_count%s)
    values (%L, %L, 'print', %L, 'typst 0.14.2 · c1', %s, %s, %s, 999%s)$f$,
    coalesce(', ' || xcols, ''),
    (select user_id from public.books where id = b), b,
    coalesce(k, public.cover_key(b, 'print'), '0123456789abcdef0123456789abcdef'),
    coalesce(w, round(0.25 + 2 * tw + coalesce(n, 0) * r, 4)), round(th + 0.25, 4), round(coalesce(n, 0) * r, 4),
    coalesce(', ' || xvals, '')));
end $$;

create function pg_temp.cover_kindle(b uuid, px int default 1600) returns text language plpgsql as $$
begin
  return pg_temp.err(format($f$insert into public.cover_exports (user_id, book_id, kind, settings_key, engine, width_px, height_px)
    values (%L, %L, 'kindle', %L, 'typst 0.14.2 · c1', %s, 2560)$f$,
    (select user_id from public.books where id = b), b, coalesce(public.cover_key(b, 'kindle'), '0123456789abcdef0123456789abcdef'), px));
end $$;
grant execute on all functions in schema pg_temp to public;

-- A's first Print PDF of BOOK1 (54 pages, the real book's numbers), as the owner.
select pg_temp.is('seed: BOOK1 Print PDF, 54 pages', pg_temp.pdf(:BOOK1, 54), 'OK 1');
select pg_temp.is('seed: BOOK4 Print PDF', pg_temp.pdf(:BOOK4, 24), 'OK 1');

-- ── 1. Shapes ──
select pg_temp.chk('hex: #1F3A5F ok', public.cover_hex_ok('#1F3A5F'));
select pg_temp.chk('hex: lower case, short, no # and null refused',
  not public.cover_hex_ok('#1f3a5f') and not public.cover_hex_ok('#1F3A5') and not public.cover_hex_ok('1F3A5F') and not public.cover_hex_ok(null));
select pg_temp.chk('recent: 0 to 5 distinct colors', public.cover_recent_ok('{}') and public.cover_recent_ok(array['#111111', '#222222', '#333333', '#444444', '#555555']));
select pg_temp.chk('recent: 6, a repeat, a null, a bad color, null refused',
  not public.cover_recent_ok(array['#111111', '#222222', '#333333', '#444444', '#555555', '#666666'])
  and not public.cover_recent_ok(array['#111111', '#111111']) and not public.cover_recent_ok(array['#111111', null])
  and not public.cover_recent_ok(array['red']) and not public.cover_recent_ok(null));
select pg_temp.chk('words: one space between words', public.cover_words(E'  a \n b\tc ') = 'a b c' and public.cover_words(null) = '');
select pg_temp.chk('trim: the 4 group A trims', public.cover_trim_ok('6x9') and public.cover_trim_ok('5.5x8.5') and public.cover_trim_ok('5.25x8') and public.cover_trim_ok('5x8'));
select pg_temp.chk('trim: null, 7x10, 8.5x11, "6 x 9", 6X9 refused (F2)',
  not public.cover_trim_ok(null) and not public.cover_trim_ok('7x10') and not public.cover_trim_ok('8.5x11')
  and not public.cover_trim_ok('6 x 9') and not public.cover_trim_ok('6X9'));
select pg_temp.chk('paper: cream, else white (F2)',
  public.cover_paper('cream') = 'cream' and public.cover_paper('white') = 'white' and public.cover_paper(null) = 'white' and public.cover_paper('x') = 'white');

-- ── 2. Grants (F6, F8) ──
create temp table cover_fns (f text);
insert into cover_fns values ('public.cover_hex_ok(text)'), ('public.cover_recent_ok(text[])'), ('public.cover_words(text)'),
  ('public.cover_trim_ok(text)'), ('public.cover_paper(text)'), ('public.cover_pdf(uuid)'), ('public.cover_book_key(uuid)'),
  ('public.cover_key(uuid,text)'), ('public.cover_marks(uuid)'), ('public.cover_json(uuid)');
grant select on cover_fns to public;
select pg_temp.chk(f || ': anon cannot execute', not has_function_privilege('anon', f, 'execute')) from cover_fns order by f;
select pg_temp.chk(f || ': authenticated can execute', has_function_privilege('authenticated', f, 'execute')) from cover_fns order by f;
select pg_temp.chk(f || ': no grant to PUBLIC', not exists (
    select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
     where p.oid = f::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'))
  from cover_fns order by f;
select pg_temp.chk(f || ': an explicit grant to authenticated in 0029', exists (
    select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
     where p.oid = f::regprocedure and a.grantee = 'authenticated'::regrole and a.privilege_type = 'EXECUTE'))
  from cover_fns order by f;
select pg_temp.chk(g || ': no one runs the guard', not has_function_privilege('authenticated', g, 'execute') and not has_function_privilege('anon', g, 'execute'))
  from unnest(array['public.cover_images_guard()', 'public.book_covers_guard()', 'public.cover_blurbs_guard()', 'public.cover_exports_guard()']) g order by g;

-- ── 3. Tables: RLS, policies, privileges ──
select pg_temp.chk(t || ': RLS on', (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass))
  from unnest(array['cover_images', 'book_covers', 'cover_blurbs', 'cover_exports']) t order by t;
select pg_temp.chk('policies: cover_images select, insert, update, delete',
  (select array_agg(cmd::text order by cmd) from pg_policies where tablename = 'cover_images') = array['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
select pg_temp.chk('policies: book_covers select, insert, update',
  (select array_agg(cmd::text order by cmd) from pg_policies where tablename = 'book_covers') = array['INSERT', 'SELECT', 'UPDATE']);
select pg_temp.chk('policies: cover_blurbs and cover_exports select, insert',
  (select array_agg(cmd::text order by cmd) from pg_policies where tablename = 'cover_blurbs') = array['INSERT', 'SELECT']
  and (select array_agg(cmd::text order by cmd) from pg_policies where tablename = 'cover_exports') = array['INSERT', 'SELECT']);
select pg_temp.chk('authenticated: no delete on book_covers; no update or delete on cover_blurbs and cover_exports',
  not has_table_privilege('authenticated', 'public.book_covers', 'delete')
  and not has_table_privilege('authenticated', 'public.cover_blurbs', 'update') and not has_table_privilege('authenticated', 'public.cover_blurbs', 'delete')
  and not has_table_privilege('authenticated', 'public.cover_exports', 'update') and not has_table_privilege('authenticated', 'public.cover_exports', 'delete'));

-- ── 4. book_covers as A: defaults, checks ──
:ASA
select pg_temp.expect('A makes BOOK1''s cover row (check constraints run as A, F8)', $q$insert into public.book_covers (book_id) values ('b0000000-0000-4000-8000-000000000001')$q$, 'OK 1');
select pg_temp.chk('defaults: template, band, serif, Ink blue, White, Ivory, top, dark layer, author line, crop 0.5',
  (select (mode, template, font_pair, main_color, title_color, paper_color, title_position, dark_layer, author_line, kindle_crop, recent_colors)
     = ('template', 'band', 'serif', '#1F3A5F', '#FFFFFF', '#F2EDE4', 'top', true, true, 0.5, '{}'::text[])
     from public.book_covers where book_id = 'b0000000-0000-4000-8000-000000000001'));
select pg_temp.chk('user_id is A (auth.uid default)', (select user_id from public.book_covers where book_id = 'b0000000-0000-4000-8000-000000000001') = :A);
select pg_temp.expect('A changes the main color (F8)', $q$update public.book_covers set main_color = '#2F4A3A', recent_colors = array['#2F4A3A'] where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('a lower-case color refused', $q$update public.book_covers set main_color = '#2f4a3a' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, '23514%');
select pg_temp.expect('6 recent colors refused', $q$update public.book_covers set recent_colors = array['#111111', '#222222', '#333333', '#444444', '#555555', '#666666'] where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, '23514%');
select pg_temp.expect('mode "photo" refused', $q$update public.book_covers set mode = 'photo' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, '23514%');
select pg_temp.expect('template "wave" refused', $q$update public.book_covers set template = 'wave' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, '23514%');
select pg_temp.expect('font pair "comic" refused', $q$update public.book_covers set font_pair = 'comic' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, '23514%');
select pg_temp.expect('position "left" refused', $q$update public.book_covers set title_position = 'left' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, '23514%');
select pg_temp.expect('crop 1.5 refused', $q$update public.book_covers set kindle_crop = 1.5 where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, '23514%');
select pg_temp.expect('a headline with a line break refused', $q$update public.book_covers set headline = E'Two\nlines' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, '23514%');
select pg_temp.expect('a headline of 81 characters refused', $q$update public.book_covers set headline = repeat('x', 81) where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, '23514%');
select pg_temp.expect('a headline with a space at the end refused', $q$update public.book_covers set headline = 'Hi ' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, '23514%');
select pg_temp.expect('a headline of 80 characters', $q$update public.book_covers set headline = repeat('x', 80) where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'OK 1');

-- Title breaks (the same words as 04 Title).
select pg_temp.expect('breaks with the same words', $q$update public.book_covers set title_breaks = E'Chair Yoga\nfor Seniors' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('breaks with other words refused', $q$update public.book_covers set title_breaks = E'Chair Yoga\nfor Kids' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'P0001 cover_breaks_words%');
:OWNER
update public.books set title = 'Chair Yoga for Seniors Today' where id = :BOOK1;
:ASA
select pg_temp.expect('5 lines with the same words refused (the check)', $q$update public.book_covers set title_breaks = E'Chair\nYoga\nfor\nSeniors\nToday' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, '23514%');
select pg_temp.expect('4 lines with the same words', $q$update public.book_covers set title_breaks = E'Chair\nYoga\nfor\nSeniors Today' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('an empty line refused (the words differ only by a line, the guard passes, the check does not care)', $q$update public.book_covers set title_breaks = E'Chair Yoga\n\nfor Seniors Today' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'OK 1');
:OWNER
update public.books set title = 'Chair Yoga for Everyone' where id = :BOOK1;
:ASA
select pg_temp.expect('after a 04 title change, another field still saves (breaks not checked again)', $q$update public.book_covers set headline = 'Move more' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('but the old breaks cannot be saved again', $q$update public.book_covers set title_breaks = E'Chair Yoga\n for Seniors' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'P0001 cover_breaks_words%');
select pg_temp.expect('breaks cleared', $q$update public.book_covers set title_breaks = null where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'OK 1');
:OWNER
update public.books set title = 'Chair Yoga for Seniors' where id = :BOOK1;
:ASA
select pg_temp.expect('the row stays with its book', $q$update public.book_covers set book_id = 'b0000000-0000-4000-8000-000000000002' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'P0001 cover_fixed%');
select pg_temp.expect('A cannot delete the row', $q$delete from public.book_covers where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, '42501%');
select pg_temp.expect('a cover row on B''s book refused', $q$insert into public.book_covers (book_id) values ('b0000000-0000-4000-8000-00000000000b')$q$, '42501%');
select pg_temp.chk('a cover edit moves the book to the top (touch)',
  (select updated_at from public.books where id = 'b0000000-0000-4000-8000-000000000001') >= (select updated_at from public.book_covers where book_id = 'b0000000-0000-4000-8000-000000000001') - interval '1 second');

-- ── 5. cover_images as A ──
select pg_temp.expect('a front picture of BOOK1', $q$insert into public.cover_images (id, book_id, kind, path, width, height, bytes)
  values ('10000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'front',
          '00000000-0000-4000-8000-00000000000a/b0000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001.jpg', 1838, 2775, 900000)$q$, 'OK 1');
select pg_temp.chk('source is upload by default (F7)', (select source from public.cover_images where id = '10000000-0000-4000-8000-000000000001') = 'upload');
select pg_temp.expect('source "ai" allowed (F7)', $q$insert into public.cover_images (id, book_id, kind, source, path, width, height, bytes)
  values ('10000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000001', 'front', 'ai',
          '00000000-0000-4000-8000-00000000000a/b0000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000005.jpg', 1838, 2775, 900000)$q$, 'OK 1');
select pg_temp.expect('source "other" refused (F7)', $q$insert into public.cover_images (id, book_id, kind, source, path, width, height, bytes)
  values ('10000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000001', 'front', 'other',
          '00000000-0000-4000-8000-00000000000a/b0000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000006.jpg', 1838, 2775, 900000)$q$, '23514%');
select pg_temp.expect('a path not made of user, book and id refused', $q$insert into public.cover_images (id, book_id, kind, path, width, height, bytes)
  values ('10000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000001', 'front',
          '00000000-0000-4000-8000-00000000000a/b0000000-0000-4000-8000-000000000001/other.jpg', 1838, 2775, 900000)$q$, '23514%');
select pg_temp.expect('a picture over 4096 px refused', $q$insert into public.cover_images (id, book_id, kind, path, width, height, bytes)
  values ('10000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000001', 'front',
          '00000000-0000-4000-8000-00000000000a/b0000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000008.jpg', 5000, 2775, 900000)$q$, '23514%');
select pg_temp.expect('over 10 MB refused', $q$insert into public.cover_images (id, book_id, kind, path, width, height, bytes)
  values ('10000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000001', 'front',
          '00000000-0000-4000-8000-00000000000a/b0000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000008.jpg', 1838, 2775, 10485761)$q$, '23514%');
select pg_temp.expect('a Kindle version under 1600 x 2560 refused', $q$insert into public.cover_images (id, book_id, kind, path, width, height, bytes)
  values ('10000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000001', 'kindle',
          '00000000-0000-4000-8000-00000000000a/b0000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000008.jpg', 1599, 2560, 500000)$q$, '23514%');
select pg_temp.expect('a Kindle version of BOOK1', $q$insert into public.cover_images (id, book_id, kind, path, width, height, bytes)
  values ('10000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'kindle',
          '00000000-0000-4000-8000-00000000000a/b0000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000002.jpg', 1600, 2560, 500000)$q$, 'OK 1');
select pg_temp.expect('a front picture of BOOK2', $q$insert into public.cover_images (id, book_id, kind, path, width, height, bytes)
  values ('10000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000002', 'front',
          '00000000-0000-4000-8000-00000000000a/b0000000-0000-4000-8000-000000000002/10000000-0000-4000-8000-000000000003.jpg', 1838, 2775, 900000)$q$, 'OK 1');
select pg_temp.expect('a picture on B''s book refused', $q$insert into public.cover_images (id, book_id, kind, path, width, height, bytes)
  values ('10000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-00000000000b', 'front',
          '00000000-0000-4000-8000-00000000000a/b0000000-0000-4000-8000-00000000000b/10000000-0000-4000-8000-000000000009.jpg', 1838, 2775, 900000)$q$, '42501%');
-- The rights tick: the server clock.
select pg_temp.expect('tick with a time from 2001', $q$update public.cover_images set rights_at = '2001-01-01' where id = '10000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.chk('rights_at is the server clock, not 2001', (select rights_at from public.cover_images where id = '10000000-0000-4000-8000-000000000001') > now() - interval '1 minute');
select (select rights_at from public.cover_images where id = '10000000-0000-4000-8000-000000000001') as t \gset first_
select pg_temp.expect('tick again while ticked', $q$update public.cover_images set rights_at = '2001-01-01' where id = '10000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.chk('a second tick keeps the first time', (select rights_at from public.cover_images where id = '10000000-0000-4000-8000-000000000001') = :'first_t'::timestamptz);
select pg_temp.expect('untick', $q$update public.cover_images set rights_at = null where id = '10000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.chk('unticked is null', (select rights_at from public.cover_images where id = '10000000-0000-4000-8000-000000000001') is null);
select pg_temp.expect('a ticked insert takes the server clock', $q$insert into public.cover_images (id, book_id, kind, path, width, height, bytes, rights_at)
  values ('10000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000002', 'front',
          '00000000-0000-4000-8000-00000000000a/b0000000-0000-4000-8000-000000000002/10000000-0000-4000-8000-000000000004.jpg', 1838, 2775, 900000, '2001-01-01')$q$, 'OK 1');
select pg_temp.chk('…and it is now', (select rights_at from public.cover_images where id = '10000000-0000-4000-8000-000000000004') > now() - interval '1 minute');
select pg_temp.expect('width cannot change', $q$update public.cover_images set width = 2000 where id = '10000000-0000-4000-8000-000000000001'$q$, 'P0001 cover_image_fixed%');
select pg_temp.expect('source cannot change (F7)', $q$update public.cover_images set source = 'ai' where id = '10000000-0000-4000-8000-000000000001'$q$, 'P0001 cover_image_fixed%');
select pg_temp.expect('kind cannot change', $q$update public.cover_images set kind = 'kindle' where id = '10000000-0000-4000-8000-000000000001'$q$, 'P0001 cover_image_fixed%');

-- book_covers: pictures of this book and of the right kind.
select pg_temp.expect('the Kindle version as the front refused', $q$update public.book_covers set front_image_id = '10000000-0000-4000-8000-000000000002' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'P0001 cover_image_not_allowed%');
select pg_temp.expect('BOOK2''s picture on BOOK1 refused', $q$update public.book_covers set front_image_id = '10000000-0000-4000-8000-000000000003' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'P0001 cover_image_not_allowed%');
select pg_temp.expect('the front as the Kindle version refused', $q$update public.book_covers set kindle_image_id = '10000000-0000-4000-8000-000000000001' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'P0001 cover_image_not_allowed%');
select pg_temp.expect('BOOK1''s own front and Kindle pictures', $q$update public.book_covers set front_image_id = '10000000-0000-4000-8000-000000000001', kindle_image_id = '10000000-0000-4000-8000-000000000002' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('a picture in use can be deleted', $q$delete from public.cover_images where id = '10000000-0000-4000-8000-000000000005'$q$, 'OK 1');

-- ── 6. cover_blurbs ──
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

-- ── 7. Keys: what moves them, and what does not ──
create temp table k (step text primary key, book text, print text, kindle text);
grant all on k to public;
create function pg_temp.keys(s text) returns void language sql as $$
  insert into k values (s, public.cover_book_key('b0000000-0000-4000-8000-000000000001'),
    public.cover_key('b0000000-0000-4000-8000-000000000001', 'print'), public.cover_key('b0000000-0000-4000-8000-000000000001', 'kindle'))
$$;
create function pg_temp.moved(a text, b text) returns text language sql as $$
  select concat_ws(',', case when x.book is distinct from y.book then 'book' end,
                        case when x.print is distinct from y.print then 'print' end,
                        case when x.kindle is distinct from y.kindle then 'kindle' end)
    from k x, k y where x.step = a and y.step = b
$$;
grant execute on all functions in schema pg_temp to public;
select pg_temp.keys('0');
select pg_temp.chk('keys: three md5 values', (select book ~ '^[0-9a-f]{32}$' and print ~ '^[0-9a-f]{32}$' and kindle ~ '^[0-9a-f]{32}$' from k where step = '0'));
select pg_temp.keys('0b');
select pg_temp.chk('keys: the same twice', pg_temp.moved('0', '0b') = '', pg_temp.moved('0', '0b'));
update public.book_covers set headline = 'A new line' where book_id = :BOOK1;
select pg_temp.keys('headline');
select pg_temp.chk('headline moves print only', pg_temp.moved('0b', 'headline') = 'print', pg_temp.moved('0b', 'headline'));
insert into public.cover_blurbs (book_id, body, source) values (:BOOK1, 'Newest blurb.', 'manual');
select pg_temp.keys('blurb');
select pg_temp.chk('a new blurb version moves print only', pg_temp.moved('headline', 'blurb') = 'print', pg_temp.moved('headline', 'blurb'));
update public.book_covers set main_color = '#7A2E2E' where book_id = :BOOK1;
select pg_temp.keys('color');
select pg_temp.chk('a color moves print and kindle', pg_temp.moved('blurb', 'color') = 'print,kindle', pg_temp.moved('blurb', 'color'));
update public.book_covers set dark_layer = false, kindle_crop = 0.2 where book_id = :BOOK1;
select pg_temp.keys('template-only');
select pg_temp.chk('dark layer and crop do not count in template mode', pg_temp.moved('color', 'template-only') = '', pg_temp.moved('color', 'template-only'));
update public.book_covers set author_line = false where book_id = :BOOK1;
select pg_temp.keys('author-off');
select pg_temp.chk('author line off moves print only', pg_temp.moved('template-only', 'author-off') = 'print', pg_temp.moved('template-only', 'author-off'));
:OWNER
update public.pen_names set bio_text = 'A new bio.' where id = :P1;
:ASA
select pg_temp.keys('bio-off');
select pg_temp.chk('the bio does not count while the author line is off', pg_temp.moved('author-off', 'bio-off') = '', pg_temp.moved('author-off', 'bio-off'));
update public.book_covers set author_line = true where book_id = :BOOK1;
select pg_temp.keys('author-on');
:OWNER
update public.pen_names set bio_text = 'Another bio.' where id = :P1;
:ASA
select pg_temp.keys('bio-on');
select pg_temp.chk('the bio counts while the author line is on (print only)', pg_temp.moved('author-on', 'bio-on') = 'print', pg_temp.moved('author-on', 'bio-on'));
select pg_temp.is('a second Print PDF with 60 pages', pg_temp.pdf(:BOOK1, 60), 'OK 1');
select pg_temp.keys('pages');
select pg_temp.chk('the page count moves book and print, not kindle', pg_temp.moved('bio-on', 'pages') = 'book,print', pg_temp.moved('bio-on', 'pages'));
update public.book_formats set paper = 'cream' where book_id = :BOOK1;
select pg_temp.keys('paper');
select pg_temp.chk('paper moves book and print, not kindle', pg_temp.moved('pages', 'paper') = 'book,print', pg_temp.moved('pages', 'paper'));
select pg_temp.chk('…and the Print PDF stays current (paper is not in format_key)', (select current from public.cover_pdf(:BOOK1)));
update public.book_formats set paper = 'white' where book_id = :BOOK1;
:OWNER
update public.books set subtitle = 'Gentle moves, seated' where id = :BOOK1;
:ASA
select pg_temp.keys('subtitle');
select pg_temp.chk('the subtitle moves all three (the Print PDF goes stale too)', pg_temp.moved('paper', 'subtitle') = 'book,print,kindle', pg_temp.moved('paper', 'subtitle'));
select pg_temp.chk('…the Print PDF is no longer current', not (select current from public.cover_pdf(:BOOK1)));
select pg_temp.chk('…so the book key has no page count', (select book from k where step = 'subtitle') = md5(jsonb_build_object('pages', null, 'trim', '6x9', 'paper', 'white',
  'title', 'Chair Yoga for Seniors', 'subtitle', 'Gentle moves, seated', 'pen_name', 'Nora Hale')::text));
:OWNER
update public.books set subtitle = 'Gentle moves' where id = :BOOK1;
:ASA
select pg_temp.is('a fresh Print PDF (60 pages)', pg_temp.pdf(:BOOK1, 60), 'OK 1');
update public.book_covers set mode = 'upload' where book_id = :BOOK1;
select pg_temp.keys('upload');
update public.book_covers set kindle_crop = 0.7 where book_id = :BOOK1;
select pg_temp.keys('crop');
select pg_temp.chk('the crop moves kindle only in upload mode', pg_temp.moved('upload', 'crop') = 'kindle', pg_temp.moved('upload', 'crop'));
update public.book_covers set mode = 'template' where book_id = :BOOK1;
select pg_temp.chk('cover_key: null for another kind', public.cover_key(:BOOK1, 'epub') is null);
select pg_temp.chk('cover_key: null without a cover row', public.cover_key(:BOOK4, 'print') is null);

-- ── 8. The export guard ──
select pg_temp.is('no cover row: cover_missing', pg_temp.cover_print(:BOOK4), 'P0001 cover_missing%');
insert into public.book_covers (book_id) values (:BOOK2), (:BOOK4), (:BOOK5);
select pg_temp.is('no Print PDF: cover_pdf_missing', pg_temp.cover_print(:BOOK2), 'P0001 cover_pdf_missing%');
select pg_temp.is('BOOK2 Print PDF', pg_temp.pdf(:BOOK2, 54), 'OK 1');
update public.book_formats set drop_cap = true where book_id = :BOOK2;
select pg_temp.is('a stale Print PDF: cover_pdf_missing', pg_temp.cover_print(:BOOK2), 'P0001 cover_pdf_missing%');
select pg_temp.is('a fresh Print PDF', pg_temp.pdf(:BOOK2, 54), 'OK 1');
select pg_temp.is('an old key: cover_stale', pg_temp.cover_print(:BOOK2, null, '0123456789abcdef0123456789abcdef'), 'P0001 cover_stale%');
select pg_temp.is('a width 0.001 in off: cover_size', pg_temp.cover_print(:BOOK2, 12.3726), 'P0001 cover_size%');
select pg_temp.is('the real book''s numbers: 12.3716 x 9.25, spine 0.1216', pg_temp.cover_print(:BOOK2), 'OK 1');
select pg_temp.chk('the server set page count 54 (not 999), the Print PDF id and the snapshot',
  (select page_count = 54 and pdf_export_id = (select export_id from public.cover_pdf(:BOOK2)) and width_in = 12.3716 and spine_in = 0.1216 and height_in = 9.25
          and snapshot = jsonb_build_object('title', 'Second Book', 'subtitle', null, 'pen_name', 'Nora Hale', 'trim', '6x9', 'paper', 'white',
                                            'page_count', 54, 'mode', 'template', 'template', 'band')
     from public.cover_exports where book_id = :BOOK2 and kind = 'print'));
select pg_temp.is('a Kindle JPG', pg_temp.cover_kindle(:BOOK2), 'OK 1');
select pg_temp.is('a Kindle JPG of 1599 px refused (check)', pg_temp.cover_kindle(:BOOK2, 1599), '23514%');
-- E15 Part 6: the Kindle row's own guard cases (the panel sends 1600 x 2560, the key and the engine only).
select pg_temp.expect('a Kindle row with a thumbnail refused (check)', format($q$insert into public.cover_exports (user_id, book_id, kind, settings_key, engine, width_px, height_px, thumb)
  values (%L, %L, 'kindle', %L, 'canvas jpeg · c1', 1600, 2560, 'data:image/jpeg;base64,/9j/')$q$, :A, :BOOK2, public.cover_key(:BOOK2, 'kindle')), '23514%');
select pg_temp.expect('a Kindle row with inches refused (check)', format($q$insert into public.cover_exports (user_id, book_id, kind, settings_key, engine, width_px, height_px, width_in)
  values (%L, %L, 'kindle', %L, 'canvas jpeg · c1', 1600, 2560, 6.125)$q$, :A, :BOOK2, public.cover_key(:BOOK2, 'kindle')), '23514%');
select pg_temp.expect('a Kindle row with an old key: cover_stale', format($q$insert into public.cover_exports (user_id, book_id, kind, settings_key, engine, width_px, height_px)
  values (%L, %L, 'kindle', '0123456789abcdef0123456789abcdef', 'canvas jpeg · c1', 1600, 2560)$q$, :A, :BOOK2), 'P0001 cover_stale%');
update public.book_formats set drop_cap = false where book_id = :BOOK2;
select pg_temp.is('a Kindle JPG needs a current Print PDF too: cover_pdf_missing', pg_temp.cover_kindle(:BOOK2), 'P0001 cover_pdf_missing%');
select pg_temp.is('a fresh Print PDF again', pg_temp.pdf(:BOOK2, 54), 'OK 1');
select pg_temp.chk('the server sets no page count or Print PDF id on a Kindle row',
  (select bool_and(page_count is null and pdf_export_id is null and thumb is null) from public.cover_exports where book_id = :BOOK2 and kind = 'kindle'));
select pg_temp.is('a print row with px refused (check, after the guard passes)', pg_temp.cover_print(:BOOK2, null, null, 'width_px, height_px', '1600, 2560'), '23514%');
select pg_temp.is('a thumbnail that is not a JPEG data URL refused', pg_temp.cover_print(:BOOK2, null, null, 'thumb', '''data:image/png;base64,xx'''), '23514%');
select pg_temp.is('a JPEG thumbnail over 20,000 characters refused', pg_temp.cover_print(:BOOK2, null, null, 'thumb', '''data:image/jpeg;base64,'' || repeat(''A'', 20000)'), '23514%');
select pg_temp.is('a JPEG thumbnail', pg_temp.cover_print(:BOOK2, null, null, 'thumb', '''data:image/jpeg;base64,/9j/4AAQ'''), 'OK 1');
select pg_temp.expect('an export cannot change', $q$update public.cover_exports set engine = 'x'$q$, '42501%');
select pg_temp.expect('an export cannot be deleted', $q$delete from public.cover_exports$q$, '42501%');

-- Rights (front in both image modes; the Kindle version in upload mode, F3).
update public.book_covers set mode = 'upload', front_image_id = '10000000-0000-4000-8000-000000000003' where book_id = :BOOK2;
select pg_temp.is('upload, front not ticked: cover_rights', pg_temp.cover_print(:BOOK2), 'P0001 cover_rights%');
update public.book_covers set mode = 'template_image' where book_id = :BOOK2;
select pg_temp.is('template + image, not ticked: cover_rights', pg_temp.cover_print(:BOOK2), 'P0001 cover_rights%');
update public.cover_images set rights_at = now() where id = '10000000-0000-4000-8000-000000000003';
select pg_temp.is('template + image, ticked', pg_temp.cover_print(:BOOK2), 'OK 1');
select pg_temp.expect('BOOK2''s Kindle version', $q$insert into public.cover_images (id, book_id, kind, path, width, height, bytes)
  values ('10000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000002', 'kindle',
          '00000000-0000-4000-8000-00000000000a/b0000000-0000-4000-8000-000000000002/10000000-0000-4000-8000-00000000000a.jpg', 1600, 2560, 500000)$q$, 'OK 1');
update public.book_covers set mode = 'upload', kindle_image_id = '10000000-0000-4000-8000-00000000000a' where book_id = :BOOK2;
select pg_temp.is('F3 upload, front ticked, Kindle version not ticked: cover_rights (print)', pg_temp.cover_print(:BOOK2), 'P0001 cover_rights%');
select pg_temp.is('F3 …and the Kindle JPG too', pg_temp.cover_kindle(:BOOK2), 'P0001 cover_rights%');
update public.cover_images set rights_at = now() where id = '10000000-0000-4000-8000-00000000000a';
select pg_temp.is('F3 both ticked: print', pg_temp.cover_print(:BOOK2), 'OK 1');
select pg_temp.is('F3 both ticked: kindle', pg_temp.cover_kindle(:BOOK2), 'OK 1');
update public.book_covers set mode = 'template', front_image_id = null, kindle_image_id = null where book_id = :BOOK2;

-- F2: a null trim (no Brief row) and a trim outside group A, with a current Print PDF.
:OWNER
delete from public.book_briefs where book_id = :BOOK5;
:ASA
select pg_temp.is('BOOK5 Print PDF with no Brief row', pg_temp.pdf(:BOOK5, 54), 'OK 1');
select pg_temp.is('F2 null trim: cover_trim (print)', pg_temp.cover_print(:BOOK5), 'P0001 cover_trim%');
select pg_temp.is('F2 null trim: cover_trim (kindle)', pg_temp.cover_kindle(:BOOK5), 'P0001 cover_trim%');
update public.book_briefs set trim_size = '7x10' where book_id = :BOOK4;
select pg_temp.is('BOOK4 Print PDF at 7 x 10', pg_temp.pdf(:BOOK4, 54), 'OK 1');
select pg_temp.is('F2 7 x 10: cover_trim', pg_temp.cover_print(:BOOK4), 'P0001 cover_trim%');
update public.book_briefs set trim_size = '8.5x11' where book_id = :BOOK4;
select pg_temp.is('BOOK4 Print PDF at 8.5 x 11', pg_temp.pdf(:BOOK4, 54), 'OK 1');
select pg_temp.is('F2 8.5 x 11: cover_trim', pg_temp.cover_print(:BOOK4), 'P0001 cover_trim%');

-- The size for every group A trim × paper × 24, 54, 80, 400 pages.
create function pg_temp.size_case(t text, p text, n int) returns text language plpgsql as $$
declare r text;
begin
  update public.book_briefs set trim_size = t where book_id = 'b0000000-0000-4000-8000-000000000002';
  update public.book_formats set paper = p where book_id = 'b0000000-0000-4000-8000-000000000002';
  r := pg_temp.pdf('b0000000-0000-4000-8000-000000000002', n);
  if r <> 'OK 1' then return 'pdf: ' || r; end if;
  return pg_temp.cover_print('b0000000-0000-4000-8000-000000000002');
end $$;
grant execute on all functions in schema pg_temp to public;
-- Each case is its own statement (its own server time), so "the last Print PDF" is the case's own.
select format('select pg_temp.is(%L, pg_temp.size_case(%L, %L, %s), %L)', format('size %s %s %s pages', t, p, n), t, p, n, 'OK 1')
  from unnest(array['6x9', '5.5x8.5', '5.25x8', '5x8']) with ordinality t(t, i), unnest(array['white', 'cream']) with ordinality p(p, j),
       unnest(array[24, 54, 80, 400]) with ordinality n(n, m)
 order by i, j, m \gexec
select pg_temp.chk('5 x 8, white, 400 pages → 11.1508 x 8.25, spine 0.9008',
  (select width_in = 11.1508 and height_in = 8.25 and spine_in = 0.9008
     from public.cover_exports where book_id = :BOOK2 and kind = 'print' and page_count = 400
      and snapshot ->> 'trim' = '5x8' and snapshot ->> 'paper' = 'white'));
select pg_temp.chk('the last row: 5 x 8, cream, 400 pages → 11.25 x 8.25, spine 1.0',
  (select width_in = 11.25 and height_in = 8.25 and spine_in = 1 and page_count = 400 and snapshot ->> 'paper' = 'cream'
     from public.cover_exports where book_id = :BOOK2 and kind = 'print' order by created_at desc, id desc limit 1));
select pg_temp.chk('20 print rows kept for BOOK2', (select count(*) from public.cover_exports where book_id = :BOOK2 and kind = 'print') = 20,
  (select count(*) from public.cover_exports where book_id = :BOOK2 and kind = 'print')::text);
update public.book_briefs set trim_size = '6x9' where book_id = :BOOK2;
update public.book_formats set paper = 'white' where book_id = :BOOK2;

-- ── 9. cover_marks ──
select pg_temp.is('BOOK2 Print PDF again', pg_temp.pdf(:BOOK2, 54), 'OK 1');
select pg_temp.is('BOOK2 print', pg_temp.cover_print(:BOOK2), 'OK 1');
select pg_temp.is('BOOK2 kindle', pg_temp.cover_kindle(:BOOK2), 'OK 1');
select pg_temp.chk('marks: BOOK2 current, both files current',
  (select pdf_current and print_at is not null and print_changed = false and kindle_at is not null and kindle_changed = false
     from public.cover_marks(:BOOK2)));
update public.book_covers set headline = 'Changed' where book_id = :BOOK2;
select pg_temp.chk('marks: a headline change marks print only',
  (select print_changed and not kindle_changed from public.cover_marks(:BOOK2)));
update public.book_covers set title_position = 'bottom' where book_id = :BOOK2;
select pg_temp.chk('marks: a front change marks both', (select print_changed and kindle_changed from public.cover_marks(:BOOK2)));
select pg_temp.chk('marks: BOOK1 has a Print PDF, no cover export', (select pdf_current and print_at is null and print_changed is null and kindle_changed is null from public.cover_marks(:BOOK1)));
select pg_temp.chk('marks: BOOK3 (no PDF, no export) has no row', not exists (select 1 from public.cover_marks(:BOOK3)));
select pg_temp.chk('marks: all of A''s books with a PDF (1, 2, 4, 5)', (select count(*) from public.cover_marks()) = 4, (select count(*) from public.cover_marks())::text);

-- ── 10. cover_json ──
select pg_temp.chk('cover_json: book, pdf, settings, images, blurb, keys, last, now',
  (select array_agg(k order by k) from jsonb_object_keys(public.cover_json(:BOOK1)) k) = array['blurb', 'book', 'images', 'keys', 'last', 'now', 'pdf', 'settings']);
select pg_temp.chk('cover_json: the newest blurb', public.cover_json(:BOOK1) -> 'blurb' ->> 'body' = 'Newest blurb.');
select pg_temp.chk('cover_json: images with source and no user_id (F7)',
  (select bool_and(i ? 'source' and not i ? 'user_id') from jsonb_array_elements(public.cover_json(:BOOK1) -> 'images') i)
  and jsonb_array_length(public.cover_json(:BOOK1) -> 'images') = 2);
select pg_temp.chk('cover_json: settings without user_id', not (public.cover_json(:BOOK1) -> 'settings') ? 'user_id');
select pg_temp.chk('cover_json: keys equal the functions', public.cover_json(:BOOK1) -> 'keys' ->> 'print' = public.cover_key(:BOOK1, 'print'));
select pg_temp.chk('cover_json: the last print export with its snapshot', public.cover_json(:BOOK2) -> 'last' -> 'print' -> 'snapshot' ->> 'trim' = '6x9');
select pg_temp.chk('cover_json: bio and trim', public.cover_json(:BOOK1) -> 'book' ->> 'bio_text' = 'Another bio.' and public.cover_json(:BOOK1) -> 'book' ->> 'trim' = '6x9');
-- F2: a book with no format row reads as white paper, and its book key is the white one.
select pg_temp.chk('F2 no format row: paper white in cover_json', public.cover_json(:BOOK3) -> 'book' ->> 'paper' = 'white');
select public.cover_book_key(:BOOK3) as k \gset nofmt_
:OWNER
insert into public.book_formats (book_id, user_id, paper) values (:BOOK3, :A, 'white');
:ASA
select pg_temp.chk('F2 no format row: the same book key as a white format row', public.cover_book_key(:BOOK3) = :'nofmt_k');
select pg_temp.chk('cover_json: no settings and no PDF yet for BOOK3', public.cover_json(:BOOK3) -> 'settings' = 'null'::jsonb and public.cover_json(:BOOK3) -> 'pdf' = 'null'::jsonb);
select pg_temp.chk('cover_json: B''s book is null for A', public.cover_json(:BOOKB) is null);
select pg_temp.chk('cover_book_key: B''s book is null for A', public.cover_book_key(:BOOKB) is null);

-- ── 11. Storage: the "covers" bucket and its policies ──
:OWNER
select pg_temp.chk('bucket covers: private, 10 MB, JPEG only',
  (select public = false and file_size_limit = 10485760 and allowed_mime_types = array['image/jpeg'] from storage.buckets where id = 'covers'));
select pg_temp.chk('storage policies: select, insert, delete (no update)',
  (select array_agg(cmd::text order by cmd) from pg_policies where schemaname = 'storage' and tablename = 'objects') = array['DELETE', 'INSERT', 'SELECT']);
:ASA
select pg_temp.expect('A uploads to A/BOOK1/<id>.jpg', $q$insert into storage.objects (bucket_id, name) values ('covers', '00000000-0000-4000-8000-00000000000a/b0000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001.jpg')$q$, 'OK 1');
select pg_temp.expect('A cannot upload to B''s folder', $q$insert into storage.objects (bucket_id, name) values ('covers', '00000000-0000-4000-8000-00000000000b/b0000000-0000-4000-8000-00000000000b/10000000-0000-4000-8000-000000000001.jpg')$q$, '42501%');
select pg_temp.expect('A cannot upload under B''s book in A''s folder', $q$insert into storage.objects (bucket_id, name) values ('covers', '00000000-0000-4000-8000-00000000000a/b0000000-0000-4000-8000-00000000000b/10000000-0000-4000-8000-000000000001.jpg')$q$, '42501%');
select pg_temp.expect('a .png name refused', $q$insert into storage.objects (bucket_id, name) values ('covers', '00000000-0000-4000-8000-00000000000a/b0000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001.png')$q$, '42501%');
select pg_temp.expect('a deeper folder refused', $q$insert into storage.objects (bucket_id, name) values ('covers', '00000000-0000-4000-8000-00000000000a/b0000000-0000-4000-8000-000000000001/x/10000000-0000-4000-8000-000000000001.jpg')$q$, '42501%');
select pg_temp.expect('the book folder only refused', $q$insert into storage.objects (bucket_id, name) values ('covers', '00000000-0000-4000-8000-00000000000a/10000000-0000-4000-8000-000000000001.jpg')$q$, '42501%');
select pg_temp.expect('another bucket refused', $q$insert into storage.objects (bucket_id, name) values ('other', '00000000-0000-4000-8000-00000000000a/b0000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001.jpg')$q$, '42501%');
select pg_temp.expect('A reads A''s file', $q$select 1 from storage.objects where bucket_id = 'covers'$q$, 'OK 1');
select pg_temp.expect('A cannot change a file (no update policy)', $q$update storage.objects set name = name where bucket_id = 'covers'$q$, 'OK 0');
:ANON
select pg_temp.expect('anon reads no file', $q$select 1 from storage.objects$q$, 'OK 0');
select pg_temp.expect('anon cannot upload', $q$insert into storage.objects (bucket_id, name) values ('covers', '00000000-0000-4000-8000-00000000000a/b0000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000009.jpg')$q$, '42501%');
:ASA
select pg_temp.expect('A deletes A''s file', $q$delete from storage.objects where bucket_id = 'covers'$q$, 'OK 1');

-- ── 12. anon: every cover function and table refused ──
:ANON
select pg_temp.expect(f || ': anon refused', format('select %s', replace(replace(replace(f, '(uuid,text)', '(null::uuid, null::text)'), '(uuid)', '(null::uuid)'),
                                                   '(text[])', '(null::text[])')::text), '42501%')
  from (select replace(f, '(text)', '(null::text)') as f from cover_fns) x order by f;
select pg_temp.chk(t || ': anon reads nothing', pg_temp.err(format('select 1 from public.%I', t)) = 'OK 0' or pg_temp.err(format('select 1 from public.%I', t)) like '42501%',
                   pg_temp.err(format('select 1 from public.%I', t)))
  from unnest(array['cover_images', 'book_covers', 'cover_blurbs', 'cover_exports']) t order by t;
:OWNER
