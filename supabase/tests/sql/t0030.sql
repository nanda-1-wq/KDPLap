-- 0030 09 Cover layers (E16 Part 3): the shapes (6 trims, fmt, the layer
-- caps with the exact byte boundary and the pgBytes fixture), the grants
-- (F6, F8), what 0030 dropped and kept, the four new tables (shape, RLS,
-- privileges), cover_designs (rev, stale autosave, checks, fixed fields),
-- cover_design_history (20 kept), cover_assets (sources, rights clock, path,
-- Unsplash hotlink, credit), cover_my_layouts (one per book, replace on
-- export, 100 cap, set null), cover_key (what moves it and what does not),
-- the export guard (every refusal; print size for 6 trims × 2 papers ×
-- 3 page counts; image px pinned from kdpCover.geo.px300; picture rights),
-- cover_marks, cover_json, the "covers" bucket and its new insert rule,
-- the book delete cascade, anon.
-- Run: supabase/tests/sql/run.sh t0030.sql
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
  (:P1, :A, 'Nora Hale', 'Nora teaches adults.'), (:PB, :B, 'Pen B', null);
insert into public.books (id, user_id, pen_name_id, title, subtitle) values
  (:BOOK1, :A, :P1, 'Chair Yoga for Seniors', 'Gentle moves'),
  (:BOOK2, :A, :P1, 'Second Book', null),
  (:BOOK3, :A, null, 'No Format Book', null),
  (:BOOK4, :A, :P1, 'Book To Delete', null),
  (:BOOK5, :A, :P1, 'Trim Book', null),
  (:BOOKB, :B, :PB, 'B Book', null);
insert into public.book_briefs (book_id, user_id, trim_size) values
  (:BOOK1, :A, '6x9'), (:BOOK2, :A, '6x9'), (:BOOK3, :A, '6x9'), (:BOOK4, :A, '6x9'), (:BOOK5, :A, '6x9'), (:BOOKB, :B, '6x9');
insert into public.book_formats (book_id, user_id) values (:BOOK1, :A), (:BOOK2, :A), (:BOOK4, :A), (:BOOK5, :A), (:BOOKB, :B);
-- B's pictures (as the owner): A must never pass a rights check with them.
insert into public.cover_assets (id, user_id, source, mime, path, width, height, bytes, rights_at) values
  ('2b000000-0000-4000-8000-000000000001', :B, 'upload', 'image/jpeg',
   '00000000-0000-4000-8000-00000000000b/assets/2b000000-0000-4000-8000-000000000001.jpg', 1000, 1000, 1000, now());

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

-- A design laid out for today's size (as the current role), and a refit to today's size (09's remap).
create function pg_temp.design(b uuid, l jsonb default '[]', bg text default '#FFFFFF') returns text language plpgsql as $$
begin
  return pg_temp.err(format('insert into public.cover_designs (book_id, fmt, layers, bg) values (%L, public.cover_fmt(%L), %L, %L)', b, b, l, bg));
end $$;
create function pg_temp.refit(b uuid) returns text language plpgsql as $$
begin
  return pg_temp.err(format('update public.cover_designs set fmt = public.cover_fmt(%L) where book_id = %L', b, b));
end $$;
create function pg_temp.set_layers(b uuid, l jsonb) returns text language plpgsql as $$
begin
  return pg_temp.err(format('update public.cover_designs set layers = %L where book_id = %L', l, b));
end $$;

-- A print export with today's key and the size computed here (or the given width / key / columns).
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
    coalesce(k, public.cover_key(b), '0123456789abcdef0123456789abcdef'),
    coalesce(w, round(0.25 + 2 * tw + coalesce(n, 0) * r, 4)), round(th + 0.25, 4), round(coalesce(n, 0) * r, 4),
    coalesce(', ' || xvals, '')));
end $$;

-- An image export with today's key and the given px.
create function pg_temp.cover_image(b uuid, w int, h int, xcols text default null, xvals text default null) returns text language plpgsql as $$
begin
  return pg_temp.err(format($f$insert into public.cover_exports (user_id, book_id, kind, settings_key, engine, width_px, height_px%s)
    values (%L, %L, 'image', %L, 'canvas png · c1', %s, %s%s)$f$,
    coalesce(', ' || xcols, ''), (select user_id from public.books where id = b), b,
    coalesce(public.cover_key(b), '0123456789abcdef0123456789abcdef'), w, h, coalesce(', ' || xvals, '')));
end $$;

create function pg_temp.cover_kindle(b uuid, px int default 1600) returns text language plpgsql as $$
begin
  return pg_temp.err(format($f$insert into public.cover_exports (user_id, book_id, kind, settings_key, engine, width_px, height_px)
    values (%L, %L, 'kindle', %L, 'canvas jpeg · c1', %s, 2560)$f$,
    (select user_id from public.books where id = b), b, coalesce(public.cover_key(b), '0123456789abcdef0123456789abcdef'), px));
end $$;

-- n shape layers; 200 shape layers whose layers::text is exactly n bytes.
create function pg_temp.shapes(n int) returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', i, 'type', 'shape') order by i), '[]'::jsonb) from generate_series(1, n) i $$;
create function pg_temp.layers_bytes(n int) returns jsonb language plpgsql as $$
declare c int; r int; o jsonb;
begin
  select octet_length(jsonb_agg(jsonb_build_object('id', i, 'type', 'shape', 'p', '') order by i)::text) into c from generate_series(1, 200) i;
  r := n - c;
  select jsonb_agg(jsonb_build_object('id', i, 'type', 'shape', 'p', repeat('x', r / 200 + case when i <= r % 200 then 1 else 0 end)) order by i)
    into o from generate_series(1, 200) i;
  return o;
end $$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.is('seed: BOOK1 Print PDF, 54 pages', pg_temp.pdf(:BOOK1, 54), 'OK 1');
select pg_temp.is('seed: BOOK4 Print PDF, 24 pages', pg_temp.pdf(:BOOK4, 24), 'OK 1');
select pg_temp.is('seed: BOOK5 Print PDF, 54 pages', pg_temp.pdf(:BOOK5, 54), 'OK 1');

-- ── 1. Shapes ──
select pg_temp.chk('trim: the 6 trims 09 draws (kdpCover.geo.TRIMS)', public.cover_trim_ok('5x8') and public.cover_trim_ok('5.25x8')
  and public.cover_trim_ok('5.5x8.5') and public.cover_trim_ok('6x9') and public.cover_trim_ok('8x10') and public.cover_trim_ok('8.5x11'));
select pg_temp.chk('trim: null, 7x10, "6 x 9", 6X9, "8.5x11 " refused',
  not public.cover_trim_ok(null) and not public.cover_trim_ok('7x10') and not public.cover_trim_ok('6 x 9')
  and not public.cover_trim_ok('6X9') and not public.cover_trim_ok('8.5x11 '));
select pg_temp.chk('fmt: 6x9 / 54 / white, 8.5x11 / 828 / cream, 5x8 / 1 / white',
  public.cover_fmt_ok('{"trim": "6x9", "pages": 54, "paper": "white"}') and public.cover_fmt_ok('{"trim": "8.5x11", "pages": 828, "paper": "cream"}')
  and public.cover_fmt_ok('{"trim": "5x8", "pages": 1, "paper": "white"}'));
select pg_temp.chk('fmt: pages 0, 829, 54.5 and "54" refused',
  not public.cover_fmt_ok('{"trim": "6x9", "pages": 0, "paper": "white"}') and not public.cover_fmt_ok('{"trim": "6x9", "pages": 829, "paper": "white"}')
  and not public.cover_fmt_ok('{"trim": "6x9", "pages": 54.5, "paper": "white"}') and not public.cover_fmt_ok('{"trim": "6x9", "pages": "54", "paper": "white"}'));
select pg_temp.chk('fmt: trim 7x10, paper gloss, an extra key, a missing key, null pages refused',
  not public.cover_fmt_ok('{"trim": "7x10", "pages": 54, "paper": "white"}') and not public.cover_fmt_ok('{"trim": "6x9", "pages": 54, "paper": "gloss"}')
  and not public.cover_fmt_ok('{"trim": "6x9", "pages": 54, "paper": "white", "x": 1}') and not public.cover_fmt_ok('{"trim": "6x9", "pages": 54}')
  and not public.cover_fmt_ok('{"trim": "6x9", "pages": null, "paper": "white"}'));
select pg_temp.chk('fmt: an array, a number, a string and null are false, not an error',
  not public.cover_fmt_ok('[1]') and not public.cover_fmt_ok('5') and not public.cover_fmt_ok('"6x9"') and not public.cover_fmt_ok(null));
select pg_temp.chk('layers: [] and 200 layers ok', public.cover_layers_ok('[]') and public.cover_layers_ok(pg_temp.shapes(200)));
select pg_temp.chk('layers: 201 refused', not public.cover_layers_ok(pg_temp.shapes(201)));
select pg_temp.chk('layers: a text of 2,000 characters ok, 2,001 refused',
  public.cover_layers_ok(jsonb_build_array(jsonb_build_object('id', 1, 'type', 'text', 'text', repeat('é', 2000))))
  and not public.cover_layers_ok(jsonb_build_array(jsonb_build_object('id', 1, 'type', 'text', 'text', repeat('a', 2001)))));
select pg_temp.chk('layers: string ids ok', public.cover_layers_ok('[{"id": "a1", "type": "image"}, {"id": 2, "type": "shape"}]'));
select pg_temp.chk('layers: no id, id true, id null, id {} refused',
  not public.cover_layers_ok('[{"type": "shape"}]') and not public.cover_layers_ok('[{"id": true, "type": "shape"}]')
  and not public.cover_layers_ok('[{"id": null, "type": "shape"}]') and not public.cover_layers_ok('[{"id": {}, "type": "shape"}]'));
select pg_temp.chk('layers: type video, no type, a number, an array refused',
  not public.cover_layers_ok('[{"id": 1, "type": "video"}]') and not public.cover_layers_ok('[{"id": 1}]')
  and not public.cover_layers_ok('[1]') and not public.cover_layers_ok('[[{"id": 1, "type": "shape"}]]'));
select pg_temp.chk('layers: an object, a string and null are false, not an error',
  not public.cover_layers_ok('{"id": 1, "type": "shape"}') and not public.cover_layers_ok('"x"') and not public.cover_layers_ok(null));
select pg_temp.chk('layers: the helper makes exactly 524,288 bytes', octet_length(pg_temp.layers_bytes(524288)::text) = 524288,
  octet_length(pg_temp.layers_bytes(524288)::text)::text);
select pg_temp.chk('layers: 524,288 bytes of layers::text ok (200 layers)', public.cover_layers_ok(pg_temp.layers_bytes(524288)));
select pg_temp.chk('layers: 524,289 bytes refused', not public.cover_layers_ok(pg_temp.layers_bytes(524289)));
-- The byte measure: the browser's kdpCover.model.pgBytes gives the same number (limits-parity reads this line).
select pg_temp.chk('pgBytes fixture: layers::text is 245 bytes', octet_length($pgb$[{"id":1,"type":"text","text":"é \"q\" \\ \n\t\u0001 😀","n":[1e-7,1.2345e-7,1e+21,1.5e+21,-2.5e-8,0.30000000000000004,0,123456789012345680000,true,false,null],"o":{},"a":[]}]$pgb$::jsonb::text) = 245);
select pg_temp.chk('kept from 0029: hex, paper', public.cover_hex_ok('#1F3A5F') and not public.cover_hex_ok('#1f3a5f') and public.cover_paper(null) = 'white');

-- ── 2. Grants (F6, F8), what 0030 dropped and kept ──
create temp table fns30 (f text);
insert into fns30 values ('public.cover_trim_ok(text)'), ('public.cover_fmt_ok(jsonb)'), ('public.cover_layers_ok(jsonb)'),
  ('public.cover_fmt(uuid)'), ('public.cover_key(uuid)'), ('public.cover_marks(uuid)'), ('public.cover_json(uuid)');
grant select on fns30 to public;
select pg_temp.chk(f || ': anon cannot execute', not has_function_privilege('anon', f, 'execute')) from fns30 order by f;
select pg_temp.chk(f || ': authenticated can execute', has_function_privilege('authenticated', f, 'execute')) from fns30 order by f;
select pg_temp.chk(f || ': no grant to PUBLIC', not exists (
    select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
     where p.oid = f::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'))
  from fns30 order by f;
select pg_temp.chk(f || ': an explicit grant to authenticated', exists (
    select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
     where p.oid = f::regprocedure and a.grantee = 'authenticated'::regrole and a.privilege_type = 'EXECUTE'))
  from fns30 order by f;
select pg_temp.chk(g || ': no one runs the guard', not has_function_privilege('authenticated', g, 'execute') and not has_function_privilege('anon', g, 'execute'))
  from unnest(array['public.cover_designs_guard()', 'public.cover_design_history_guard()', 'public.cover_assets_guard()',
                    'public.cover_my_layouts_guard()', 'public.cover_exports_guard()']) g order by g;
select pg_temp.chk('dropped: book_covers and cover_images', to_regclass('public.book_covers') is null and to_regclass('public.cover_images') is null);
select pg_temp.chk('dropped: cover_book_key, cover_key(uuid, text), book_covers_guard, cover_images_guard',
  to_regprocedure('public.cover_book_key(uuid)') is null and to_regprocedure('public.cover_key(uuid,text)') is null
  and to_regprocedure('public.book_covers_guard()') is null and to_regprocedure('public.cover_images_guard()') is null);
select pg_temp.chk('dropped: the old storage insert rule covers_insert_own', not exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'covers_insert_own'));
select pg_temp.chk('kept: cover_blurbs, cover_exports, cover_pdf, cover_paper, cover_hex_ok, cover_recent_ok, cover_words',
  to_regclass('public.cover_blurbs') is not null and to_regclass('public.cover_exports') is not null
  and to_regprocedure('public.cover_pdf(uuid)') is not null and to_regprocedure('public.cover_paper(text)') is not null
  and to_regprocedure('public.cover_hex_ok(text)') is not null and to_regprocedure('public.cover_recent_ok(text[])') is not null
  and to_regprocedure('public.cover_words(text)') is not null);
select pg_temp.chk('no public object still names book_covers or cover_images', not exists (
  select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.prosrc like '%book_covers%' or p.prosrc like '%cover_images%')));

-- ── 3. Tables: RLS, policies, privileges ──
select pg_temp.chk(t || ': RLS on', (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass))
  from unnest(array['cover_designs', 'cover_design_history', 'cover_assets', 'cover_my_layouts']) t order by t;
select pg_temp.chk('policies: cover_designs select, insert, update',
  (select array_agg(cmd::text order by cmd) from pg_policies where tablename = 'cover_designs') = array['INSERT', 'SELECT', 'UPDATE']);
select pg_temp.chk('policies: cover_design_history select, insert',
  (select array_agg(cmd::text order by cmd) from pg_policies where tablename = 'cover_design_history') = array['INSERT', 'SELECT']);
select pg_temp.chk('policies: cover_assets select, insert, delete',
  (select array_agg(cmd::text order by cmd) from pg_policies where tablename = 'cover_assets') = array['DELETE', 'INSERT', 'SELECT']);
select pg_temp.chk('policies: cover_my_layouts select, insert, update, delete',
  (select array_agg(cmd::text order by cmd) from pg_policies where tablename = 'cover_my_layouts') = array['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
select pg_temp.chk('authenticated: no delete on cover_designs; no update or delete on history; no update on assets',
  not has_table_privilege('authenticated', 'public.cover_designs', 'delete')
  and not has_table_privilege('authenticated', 'public.cover_design_history', 'update') and not has_table_privilege('authenticated', 'public.cover_design_history', 'delete')
  and not has_table_privilege('authenticated', 'public.cover_assets', 'update') and has_table_privilege('authenticated', 'public.cover_assets', 'delete'));
select pg_temp.chk('authenticated: select, insert, update, delete on cover_my_layouts; no truncate anywhere new',
  has_table_privilege('authenticated', 'public.cover_my_layouts', 'select, insert, update, delete')
  and not has_table_privilege('authenticated', 'public.cover_designs', 'truncate') and not has_table_privilege('authenticated', 'public.cover_design_history', 'truncate')
  and not has_table_privilege('authenticated', 'public.cover_assets', 'truncate') and not has_table_privilege('authenticated', 'public.cover_my_layouts', 'truncate'));

-- ── 4. cover_designs as A ──
:ASA
select pg_temp.is('no current Print PDF: fmt has no pages, refused (check)', pg_temp.design(:BOOK2), '23514%');
select pg_temp.is('A makes BOOK1''s design (checks run as A, F8)', pg_temp.design(:BOOK1), 'OK 1');
select pg_temp.chk('defaults: layers [], bg white, no layout, no remap, rev 1, user A, today''s fmt',
  (select layers = '[]' and bg = '#FFFFFF' and layout is null and last_remap is null and rev = 1 and user_id = :A
          and fmt = '{"trim": "6x9", "pages": 54, "paper": "white"}'
     from public.cover_designs where book_id = :BOOK1));
select pg_temp.expect('an insert that names rev 9', $q$insert into public.cover_designs (book_id, fmt, rev) values ('b0000000-0000-4000-8000-000000000004', public.cover_fmt('b0000000-0000-4000-8000-000000000004'), 9)$q$, 'OK 1');
select pg_temp.chk('…starts at rev 1', (select rev from public.cover_designs where book_id = :BOOK4) = 1);
select pg_temp.expect('autosave at rev 1', $q$update public.cover_designs set layers = '[{"id": 1, "type": "shape"}]' where book_id = 'b0000000-0000-4000-8000-000000000001' and rev = 1$q$, 'OK 1');
select pg_temp.chk('…rev is 2', (select rev from public.cover_designs where book_id = :BOOK1) = 2);
select pg_temp.expect('a second tab still at rev 1 saves 0 rows (R11)', $q$update public.cover_designs set layers = '[]' where book_id = 'b0000000-0000-4000-8000-000000000001' and rev = 1$q$, 'OK 0');
select pg_temp.expect('rev set by hand to 50', $q$update public.cover_designs set rev = 50, created_at = '2001-01-01' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.chk('…is old + 1 (3), and created_at stays', (select rev = 3 and created_at > now() - interval '1 hour' from public.cover_designs where book_id = :BOOK1));
select pg_temp.expect('a lower-case bg refused', $q$update public.cover_designs set bg = '#ffffff' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, '23514%');
select pg_temp.expect('bg "red" refused', $q$update public.cover_designs set bg = 'red' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, '23514%');
select pg_temp.expect('layout band', $q$update public.cover_designs set layout = 'band' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('layout my:<id>', $q$update public.cover_designs set layout = 'my:2c000000-0000_x' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('layout "wave" refused', $q$update public.cover_designs set layout = 'wave' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, '23514%');
select pg_temp.expect('layout "my:" and "my:a b" refused', $q$update public.cover_designs set layout = 'my:a b' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, '23514%');
select pg_temp.expect('a size note', $q$update public.cover_designs set last_remap = '{"from": {"trim": "6x9", "pages": 24, "paper": "white"}, "to": {"trim": "6x9", "pages": 54, "paper": "white"}, "moved": [1, 2], "spineFrom": false, "spineTo": false, "at": "2026-11-15", "seen": false}' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('a size note without moved[] refused', $q$update public.cover_designs set last_remap = '{"from": {"trim": "6x9", "pages": 24, "paper": "white"}, "to": {"trim": "6x9", "pages": 54, "paper": "white"}}' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, '23514%');
select pg_temp.expect('a size note from a bad size refused', $q$update public.cover_designs set last_remap = '{"from": {"trim": "7x10", "pages": 24, "paper": "white"}, "to": {"trim": "6x9", "pages": 54, "paper": "white"}, "moved": []}' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, '23514%');
select pg_temp.expect('a size note that is a string refused', $q$update public.cover_designs set last_remap = '"x"' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, '23514%');
select pg_temp.is('201 layers refused', pg_temp.set_layers(:BOOK1, pg_temp.shapes(201)), '23514%');
select pg_temp.is('a text of 2,001 characters refused', pg_temp.set_layers(:BOOK1, jsonb_build_array(jsonb_build_object('id', 1, 'type', 'text', 'text', repeat('a', 2001)))), '23514%');
select pg_temp.is('layers that are an object refused', pg_temp.set_layers(:BOOK1, '{"id": 1}'), '23514%');
select pg_temp.is('524,288 bytes of layers saved (200 layers)', pg_temp.set_layers(:BOOK1, pg_temp.layers_bytes(524288)), 'OK 1');
select pg_temp.is('524,289 bytes refused', pg_temp.set_layers(:BOOK1, pg_temp.layers_bytes(524289)), '23514%');
select pg_temp.expect('a fmt with 829 pages refused', $q$update public.cover_designs set fmt = '{"trim": "6x9", "pages": 829, "paper": "white"}' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, '23514%');
select pg_temp.expect('a fmt at 8.5 x 11 (09 draws it)', $q$update public.cover_designs set fmt = '{"trim": "8.5x11", "pages": 54, "paper": "cream"}' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.is('…and back to today''s size', pg_temp.refit(:BOOK1), 'OK 1');
select pg_temp.expect('the row stays with its book', $q$update public.cover_designs set book_id = 'b0000000-0000-4000-8000-000000000002' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'P0001 cover_fixed%');
select pg_temp.expect('the row stays with its owner', $q$update public.cover_designs set user_id = '00000000-0000-4000-8000-00000000000b' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'P0001 cover_fixed%');
select pg_temp.expect('A cannot delete the row', $q$delete from public.cover_designs where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, '42501%');
select pg_temp.expect('a design on B''s book refused', $q$insert into public.cover_designs (book_id, fmt) values ('b0000000-0000-4000-8000-00000000000b', '{"trim": "6x9", "pages": 54, "paper": "white"}')$q$, '42501%');
select pg_temp.expect('a second row for BOOK1 refused (one per book)', $q$insert into public.cover_designs (book_id, fmt) values ('b0000000-0000-4000-8000-000000000001', '{"trim": "6x9", "pages": 54, "paper": "white"}')$q$, '23505%');
select pg_temp.chk('a design edit moves the book to the top (touch)',
  (select updated_at from public.books where id = :BOOK1) >= (select updated_at from public.cover_designs where book_id = :BOOK1) - interval '1 second');
select pg_temp.is('BOOK1 back to a small design', pg_temp.set_layers(:BOOK1, '[{"id": 1, "type": "text", "text": "Chair Yoga"}]'), 'OK 1');

-- ── 5. cover_design_history ──
select pg_temp.expect('a visit snapshot', $q$insert into public.cover_design_history (book_id, reason, layers, bg, fmt, created_at)
  select book_id, 'visit', layers, bg, fmt, '2001-01-01' from public.cover_designs where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.chk('created_at is the server clock', (select created_at > now() - interval '1 minute' from public.cover_design_history));
select pg_temp.expect('reason "save" refused', $q$insert into public.cover_design_history (book_id, reason, layers, bg, fmt) values ('b0000000-0000-4000-8000-000000000001', 'save', '[]', '#FFFFFF', '{"trim": "6x9", "pages": 54, "paper": "white"}')$q$, '23514%');
select pg_temp.expect('a bad fmt refused', $q$insert into public.cover_design_history (book_id, reason, layers, bg, fmt) values ('b0000000-0000-4000-8000-000000000001', 'layout', '[]', '#FFFFFF', '{}')$q$, '23514%');
select pg_temp.expect('a bad bg refused', $q$insert into public.cover_design_history (book_id, reason, layers, bg, fmt) values ('b0000000-0000-4000-8000-000000000001', 'layout', '[]', 'white', '{"trim": "6x9", "pages": 54, "paper": "white"}')$q$, '23514%');
select pg_temp.is('201 layers refused', pg_temp.err(format($f$insert into public.cover_design_history (book_id, reason, layers, bg, fmt) values ('b0000000-0000-4000-8000-000000000001', 'remap', %L, '#FFFFFF', '{"trim": "6x9", "pages": 54, "paper": "white"}')$f$, pg_temp.shapes(201))), '23514%');
select pg_temp.expect('a snapshot cannot change', $q$update public.cover_design_history set reason = 'export'$q$, '42501%');
select pg_temp.expect('a snapshot cannot be deleted', $q$delete from public.cover_design_history$q$, '42501%');
select pg_temp.expect('a snapshot of B''s book refused', $q$insert into public.cover_design_history (book_id, reason, layers, bg, fmt) values ('b0000000-0000-4000-8000-00000000000b', 'visit', '[]', '#FFFFFF', '{"trim": "6x9", "pages": 54, "paper": "white"}')$q$, '42501%');
-- 22 snapshots of BOOK4, each its own statement (its own server time), as the app sends them.
\o /dev/null
select format($f$insert into public.cover_design_history (book_id, reason, layers, bg, fmt) values ('b0000000-0000-4000-8000-000000000004', 'layout', '[{"id": %s, "type": "shape"}]', '#FFFFFF', '{"trim": "6x9", "pages": 24, "paper": "white"}')$f$, n)
  from generate_series(1, 22) n order by n \gexec
\o
select pg_temp.chk('20 snapshots kept per book', (select count(*) from public.cover_design_history where book_id = :BOOK4) = 20,
  (select count(*) from public.cover_design_history where book_id = :BOOK4)::text);
select pg_temp.chk('the newest is kept, the oldest went', exists (select 1 from public.cover_design_history where layers = '[{"id": 22, "type": "shape"}]')
  and not exists (select 1 from public.cover_design_history where layers in ('[{"id": 1, "type": "shape"}]', '[{"id": 2, "type": "shape"}]')));
select pg_temp.chk('BOOK1''s snapshot is untouched', (select count(*) from public.cover_design_history where book_id = :BOOK1) = 1);

-- ── 6. cover_assets ──
select pg_temp.expect('an upload with the rights tick', $q$insert into public.cover_assets (id, source, mime, path, width, height, bytes, rights_at, created_at, origin_book_id)
  values ('1a000000-0000-4000-8000-000000000001', 'upload', 'image/jpeg', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000001.jpg',
          1838, 2775, 900000, '2001-01-01', '2001-01-01', 'b0000000-0000-4000-8000-000000000001')$q$, 'OK 1');
select pg_temp.chk('rights_at and created_at are the server clock, user A', (select rights_at > now() - interval '1 minute' and created_at > now() - interval '1 minute' and user_id = :A
  from public.cover_assets where id = '1a000000-0000-4000-8000-000000000001'));
select pg_temp.expect('an upload without the tick refused', $q$insert into public.cover_assets (id, source, mime, path, width, height, bytes)
  values ('1a000000-0000-4000-8000-000000000009', 'upload', 'image/jpeg', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000009.jpg', 10, 10, 10)$q$, '23514%');
select pg_temp.expect('a PDF page without the tick refused', $q$insert into public.cover_assets (id, source, mime, path, width, height, bytes)
  values ('1a000000-0000-4000-8000-000000000009', 'pdf', 'image/png', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000009.png', 10, 10, 10)$q$, '23514%');
select pg_temp.expect('a transparent PNG from a PDF page, ticked', $q$insert into public.cover_assets (id, source, mime, path, width, height, bytes, transparent, rights_at)
  values ('1a000000-0000-4000-8000-000000000002', 'pdf', 'image/png', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000002.png', 12000, 12000, 10485760, true, now())$q$, 'OK 1');
select pg_temp.expect('a Pixabay copy with its credit, no tick', $q$insert into public.cover_assets (id, source, mime, path, width, height, bytes, credit)
  values ('1a000000-0000-4000-8000-000000000003', 'pixabay', 'image/jpeg', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000003.jpg', 1280, 853, 200000,
          '{"id": 12345, "author": "Ann", "authorUrl": "https://pixabay.com/users/ann-1/", "pageUrl": "https://pixabay.com/photos/x-12345/"}')$q$, 'OK 1');
select pg_temp.expect('an Unsplash hotlink: no path, no bytes, the raw URL and the credit', $q$insert into public.cover_assets (id, source, mime, width, height, remote, credit)
  values ('1a000000-0000-4000-8000-000000000004', 'unsplash', 'image/jpeg', 6000, 4000, '{"url": "https://images.unsplash.com/photo-1?ixid=abc", "width": 6000, "height": 4000}',
          '{"id": "abc", "author": "Bo", "authorUrl": "https://unsplash.com/@bo", "pageUrl": "https://unsplash.com/photos/abc"}')$q$, 'OK 1');
select pg_temp.expect('Pixabay without a credit refused', $q$insert into public.cover_assets (id, source, mime, path, width, height, bytes)
  values ('1a000000-0000-4000-8000-000000000009', 'pixabay', 'image/jpeg', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000009.jpg', 10, 10, 10)$q$, '23514%');
select pg_temp.expect('a credit without pageUrl refused', $q$insert into public.cover_assets (id, source, mime, path, width, height, bytes, credit)
  values ('1a000000-0000-4000-8000-000000000009', 'pixabay', 'image/jpeg', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000009.jpg', 10, 10, 10, '{"id": 1, "author": "A", "authorUrl": "u"}')$q$, '23514%');
select pg_temp.expect('a credit on an upload refused', $q$insert into public.cover_assets (id, source, mime, path, width, height, bytes, rights_at, credit)
  values ('1a000000-0000-4000-8000-000000000009', 'upload', 'image/jpeg', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000009.jpg', 10, 10, 10, now(), '{"id": 1, "author": "A", "authorUrl": "u", "pageUrl": "p"}')$q$, '23514%');
select pg_temp.expect('Unsplash with a copy in the bucket refused', $q$insert into public.cover_assets (id, source, mime, path, width, height, remote, credit)
  values ('1a000000-0000-4000-8000-000000000009', 'unsplash', 'image/jpeg', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000009.jpg', 10, 10,
          '{"url": "https://images.unsplash.com/x"}', '{"id": "a", "author": "B", "authorUrl": "u", "pageUrl": "p"}')$q$, '23514%');
select pg_temp.expect('Unsplash without the raw URL refused', $q$insert into public.cover_assets (id, source, mime, width, height, credit)
  values ('1a000000-0000-4000-8000-000000000009', 'unsplash', 'image/jpeg', 10, 10, '{"id": "a", "author": "B", "authorUrl": "u", "pageUrl": "p"}')$q$, '23514%');
select pg_temp.expect('Unsplash from another host refused', $q$insert into public.cover_assets (id, source, mime, width, height, remote, credit)
  values ('1a000000-0000-4000-8000-000000000009', 'unsplash', 'image/jpeg', 10, 10, '{"url": "https://example.com/x.jpg"}', '{"id": "a", "author": "B", "authorUrl": "u", "pageUrl": "p"}')$q$, '23514%');
select pg_temp.expect('Unsplash with a byte size refused', $q$insert into public.cover_assets (id, source, mime, width, height, bytes, remote, credit)
  values ('1a000000-0000-4000-8000-000000000009', 'unsplash', 'image/jpeg', 10, 10, 10, '{"url": "https://images.unsplash.com/x"}', '{"id": "a", "author": "B", "authorUrl": "u", "pageUrl": "p"}')$q$, '23514%');
select pg_temp.expect('a remote URL on an upload refused', $q$insert into public.cover_assets (id, source, mime, path, width, height, bytes, rights_at, remote)
  values ('1a000000-0000-4000-8000-000000000009', 'upload', 'image/jpeg', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000009.jpg', 10, 10, 10, now(), '{"url": "https://images.unsplash.com/x"}')$q$, '23514%');
select pg_temp.expect('a path in B''s folder refused', $q$insert into public.cover_assets (id, source, mime, path, width, height, bytes, rights_at)
  values ('1a000000-0000-4000-8000-000000000009', 'upload', 'image/jpeg', '00000000-0000-4000-8000-00000000000b/assets/1a000000-0000-4000-8000-000000000009.jpg', 10, 10, 10, now())$q$, '23514%');
select pg_temp.expect('a PNG named .jpg refused', $q$insert into public.cover_assets (id, source, mime, path, width, height, bytes, rights_at)
  values ('1a000000-0000-4000-8000-000000000009', 'upload', 'image/png', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000009.jpg', 10, 10, 10, now())$q$, '23514%');
select pg_temp.expect('the old book folder path refused', $q$insert into public.cover_assets (id, source, mime, path, width, height, bytes, rights_at)
  values ('1a000000-0000-4000-8000-000000000009', 'upload', 'image/jpeg', '00000000-0000-4000-8000-00000000000a/b0000000-0000-4000-8000-000000000001/1a000000-0000-4000-8000-000000000009.jpg', 10, 10, 10, now())$q$, '23514%');
select pg_temp.expect('an upload without a path refused', $q$insert into public.cover_assets (id, source, mime, width, height, bytes, rights_at)
  values ('1a000000-0000-4000-8000-000000000009', 'upload', 'image/jpeg', 10, 10, 10, now())$q$, '23514%');
select pg_temp.expect('12,001 px refused', $q$insert into public.cover_assets (id, source, mime, path, width, height, bytes, rights_at)
  values ('1a000000-0000-4000-8000-000000000009', 'upload', 'image/jpeg', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000009.jpg', 12001, 10, 10, now())$q$, '23514%');
select pg_temp.expect('10 MB + 1 byte refused', $q$insert into public.cover_assets (id, source, mime, path, width, height, bytes, rights_at)
  values ('1a000000-0000-4000-8000-000000000009', 'upload', 'image/jpeg', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000009.jpg', 10, 10, 10485761, now())$q$, '23514%');
select pg_temp.expect('an upload without a byte size refused', $q$insert into public.cover_assets (id, source, mime, path, width, height, rights_at)
  values ('1a000000-0000-4000-8000-000000000009', 'upload', 'image/jpeg', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000009.jpg', 10, 10, now())$q$, '23514%');
select pg_temp.expect('a transparent JPEG refused', $q$insert into public.cover_assets (id, source, mime, path, width, height, bytes, rights_at, transparent)
  values ('1a000000-0000-4000-8000-000000000009', 'upload', 'image/jpeg', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000009.jpg', 10, 10, 10, now(), true)$q$, '23514%');
select pg_temp.expect('a GIF refused', $q$insert into public.cover_assets (id, source, mime, path, width, height, bytes, rights_at)
  values ('1a000000-0000-4000-8000-000000000009', 'upload', 'image/gif', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000009.jpg', 10, 10, 10, now())$q$, '23514%');
select pg_temp.expect('source "ai" refused', $q$insert into public.cover_assets (id, source, mime, path, width, height, bytes, rights_at)
  values ('1a000000-0000-4000-8000-000000000009', 'ai', 'image/jpeg', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000009.jpg', 10, 10, 10, now())$q$, '23514%');
select pg_temp.expect('origin on B''s book refused', $q$insert into public.cover_assets (id, source, mime, path, width, height, bytes, rights_at, origin_book_id)
  values ('1a000000-0000-4000-8000-000000000009', 'upload', 'image/jpeg', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000009.jpg', 10, 10, 10, now(), 'b0000000-0000-4000-8000-00000000000b')$q$, '42501%');
select pg_temp.expect('a picture with B''s user id refused', $q$insert into public.cover_assets (id, user_id, source, mime, path, width, height, bytes, rights_at)
  values ('1a000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-00000000000b', 'upload', 'image/jpeg', '00000000-0000-4000-8000-00000000000b/assets/1a000000-0000-4000-8000-000000000009.jpg', 10, 10, 10, now())$q$, '42501%');
select pg_temp.expect('a picture cannot change (no update)', $q$update public.cover_assets set width = 20$q$, '42501%');
select pg_temp.expect('a picture of BOOK4 (for the delete test)', $q$insert into public.cover_assets (id, source, mime, path, width, height, bytes, rights_at, origin_book_id)
  values ('1a000000-0000-4000-8000-000000000005', 'upload', 'image/jpeg', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000005.jpg', 10, 10, 10, now(), 'b0000000-0000-4000-8000-000000000004')$q$, 'OK 1');
select pg_temp.expect('a picture to remove', $q$insert into public.cover_assets (id, source, mime, path, width, height, bytes, rights_at)
  values ('1a000000-0000-4000-8000-000000000006', 'upload', 'image/jpeg', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000006.jpg', 10, 10, 10, now())$q$, 'OK 1');
select pg_temp.expect('A removes it', $q$delete from public.cover_assets where id = '1a000000-0000-4000-8000-000000000006'$q$, 'OK 1');
select pg_temp.chk('A sees only A''s 5 pictures', (select count(*) from public.cover_assets) = 5, (select count(*) from public.cover_assets)::text);

-- ── 7. cover_my_layouts ──
select pg_temp.expect('a My layout from BOOK1', $q$insert into public.cover_my_layouts (id, name, from_book_id, from_title, fmt, bg, layers, thumb, exported_at)
  values ('2c000000-0000-4000-8000-000000000001', 'Chair Yoga', 'b0000000-0000-4000-8000-000000000001', 'Chair Yoga for Seniors',
          '{"trim": "6x9", "pages": 54, "paper": "white"}', '#1F3A5F', '[{"id": 1, "type": "text", "text": "Chair Yoga"}]', 'data:image/jpeg;base64,/9j/', '2001-01-01')$q$, 'OK 1');
select pg_temp.chk('exported_at is the server clock', (select exported_at > now() - interval '1 minute' from public.cover_my_layouts where id = '2c000000-0000-4000-8000-000000000001'));
select (select exported_at from public.cover_my_layouts where id = '2c000000-0000-4000-8000-000000000001') as t \gset my1_
select pg_temp.expect('a layout without a book refused', $q$insert into public.cover_my_layouts (name, fmt, bg, layers) values ('X', '{"trim": "6x9", "pages": 54, "paper": "white"}', '#FFFFFF', '[]')$q$, 'P0001 my_layout_book%');
select pg_temp.expect('a second layout from BOOK1 refused (one per book)', $q$insert into public.cover_my_layouts (name, from_book_id, fmt, bg, layers) values ('Again', 'b0000000-0000-4000-8000-000000000001', '{"trim": "6x9", "pages": 54, "paper": "white"}', '#FFFFFF', '[]')$q$, '23505%');
select pg_temp.expect('the export''s upsert replaces it (Q-3b)', $q$insert into public.cover_my_layouts (name, from_book_id, fmt, bg, layers) values ('Chair Yoga 2', 'b0000000-0000-4000-8000-000000000001', '{"trim": "6x9", "pages": 60, "paper": "white"}', '#2F4A3A', '[]')
  on conflict (user_id, from_book_id) do update set name = excluded.name, fmt = excluded.fmt, bg = excluded.bg, layers = excluded.layers$q$, 'OK 1');
select pg_temp.chk('…the same entry, new name, layers and time', (select count(*) = 1 and min(id::text) = '2c000000-0000-4000-8000-000000000001' and min(name) = 'Chair Yoga 2'
  and min(bg) = '#2F4A3A' and min(exported_at) > :'my1_t'::timestamptz from public.cover_my_layouts where from_book_id = :BOOK1));
select (select exported_at from public.cover_my_layouts where id = '2c000000-0000-4000-8000-000000000001') as t \gset my2_
select pg_temp.expect('rename', $q$update public.cover_my_layouts set name = 'Yoga' where id = '2c000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.chk('…keeps the export time', (select exported_at from public.cover_my_layouts where id = '2c000000-0000-4000-8000-000000000001') = :'my2_t'::timestamptz);
select pg_temp.expect('the same layout exported again (identical upsert)', $q$insert into public.cover_my_layouts (name, from_book_id, fmt, bg, layers) values ('Yoga', 'b0000000-0000-4000-8000-000000000001', '{"trim": "6x9", "pages": 60, "paper": "white"}', '#2F4A3A', '[]')
  on conflict (user_id, from_book_id) do update set name = excluded.name, fmt = excluded.fmt, bg = excluded.bg, layers = excluded.layers, thumb = excluded.thumb, from_title = excluded.from_title$q$, 'OK 1');
select pg_temp.chk('…is an export: the time moves', (select exported_at from public.cover_my_layouts where id = '2c000000-0000-4000-8000-000000000001') > :'my2_t'::timestamptz);
select pg_temp.expect('an empty name refused', $q$update public.cover_my_layouts set name = '' where id = '2c000000-0000-4000-8000-000000000001'$q$, '23514%');
select pg_temp.expect('a name of 81 characters refused', $q$update public.cover_my_layouts set name = repeat('x', 81) where id = '2c000000-0000-4000-8000-000000000001'$q$, '23514%');
select pg_temp.expect('a name with a space in front refused', $q$update public.cover_my_layouts set name = ' Yoga' where id = '2c000000-0000-4000-8000-000000000001'$q$, '23514%');
select pg_temp.expect('a name of 80 characters', $q$update public.cover_my_layouts set name = repeat('x', 80) where id = '2c000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('a PNG thumbnail refused', $q$update public.cover_my_layouts set thumb = 'data:image/png;base64,x' where id = '2c000000-0000-4000-8000-000000000001'$q$, '23514%');
select pg_temp.expect('a thumbnail over 20,000 characters refused', $q$update public.cover_my_layouts set thumb = 'data:image/jpeg;base64,' || repeat('A', 20000) where id = '2c000000-0000-4000-8000-000000000001'$q$, '23514%');
select pg_temp.expect('a title of 201 characters refused', $q$update public.cover_my_layouts set from_title = repeat('x', 201) where id = '2c000000-0000-4000-8000-000000000001'$q$, '23514%');
select pg_temp.is('201 layers refused', pg_temp.err(format($f$update public.cover_my_layouts set layers = %L where id = '2c000000-0000-4000-8000-000000000001'$f$, pg_temp.shapes(201))), '23514%');
select pg_temp.expect('a layout cannot move to another book', $q$update public.cover_my_layouts set from_book_id = 'b0000000-0000-4000-8000-000000000002' where id = '2c000000-0000-4000-8000-000000000001'$q$, 'P0001 my_layout_fixed%');
select pg_temp.expect('a layout from B''s book refused', $q$insert into public.cover_my_layouts (name, from_book_id, fmt, bg, layers) values ('B', 'b0000000-0000-4000-8000-00000000000b', '{"trim": "6x9", "pages": 54, "paper": "white"}', '#FFFFFF', '[]')$q$, '42501%');
select pg_temp.expect('a layout from BOOK4 (for the delete test)', $q$insert into public.cover_my_layouts (id, name, from_book_id, fmt, bg, layers) values ('2c000000-0000-4000-8000-000000000004', 'Four', 'b0000000-0000-4000-8000-000000000004', '{"trim": "6x9", "pages": 24, "paper": "white"}', '#FFFFFF', '[]')$q$, 'OK 1');
-- The 100 cap: 98 more books, so A has 100 layouts.
:OWNER
insert into public.books (id, user_id, title)
  select ('c0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, :A, 'Cap ' || n from generate_series(1, 99) n;
:ASA
select pg_temp.expect('98 more layouts in one statement (100 in all)', $q$insert into public.cover_my_layouts (name, from_book_id, fmt, bg, layers)
  select 'Cap', b.id, '{"trim": "6x9", "pages": 54, "paper": "white"}', '#FFFFFF', '[]' from public.books b where b.title like 'Cap %' and b.title <> 'Cap 99'$q$, 'OK 98');
select pg_temp.chk('A has 100 layouts', (select count(*) from public.cover_my_layouts) = 100, (select count(*) from public.cover_my_layouts)::text);
select pg_temp.expect('the 101st refused', $q$insert into public.cover_my_layouts (name, from_book_id, fmt, bg, layers) values ('Full', 'c0000000-0000-4000-8000-000000000099', '{"trim": "6x9", "pages": 54, "paper": "white"}', '#FFFFFF', '[]')$q$, 'P0001 my_layouts_full%');
select pg_temp.expect('at 100, an export of BOOK1 still replaces its entry', $q$insert into public.cover_my_layouts (name, from_book_id, fmt, bg, layers) values ('Yoga again', 'b0000000-0000-4000-8000-000000000001', '{"trim": "6x9", "pages": 54, "paper": "white"}', '#FFFFFF', '[]')
  on conflict (user_id, from_book_id) do update set name = excluded.name$q$, 'OK 1');
select pg_temp.expect('the × removes one', $q$delete from public.cover_my_layouts where from_book_id = 'c0000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('then the 100th fits again', $q$insert into public.cover_my_layouts (name, from_book_id, fmt, bg, layers) values ('Last', 'c0000000-0000-4000-8000-000000000099', '{"trim": "6x9", "pages": 54, "paper": "white"}', '#FFFFFF', '[]')$q$, 'OK 1');
:OWNER
delete from public.cover_my_layouts where name in ('Cap', 'Last');
delete from public.books where title like 'Cap %';
:ASA

-- ── 8. cover_key: what moves it, and what does not ──
create temp table k (step text primary key, key text, fmt jsonb);
grant all on k to public;
create function pg_temp.keys(s text) returns void language sql as $$
  insert into k values (s, public.cover_key('b0000000-0000-4000-8000-000000000001'), public.cover_fmt('b0000000-0000-4000-8000-000000000001')) $$;
create function pg_temp.moved(a text, b text) returns text language sql as $$
  select concat_ws(',', case when x.key is distinct from y.key then 'key' end, case when x.fmt is distinct from y.fmt then 'fmt' end)
    from k x, k y where x.step = a and y.step = b $$;
grant execute on all functions in schema pg_temp to public;
select pg_temp.keys('0');
select pg_temp.chk('key: md5 of the design''s layers, bg and fmt', (select key from k where step = '0') = (select md5(jsonb_build_object('layers', layers, 'bg', bg, 'fmt', fmt)::text)
  from public.cover_designs where book_id = :BOOK1));
select pg_temp.keys('0b');
select pg_temp.chk('key: the same twice', pg_temp.moved('0', '0b') = '', pg_temp.moved('0', '0b'));
select pg_temp.is('a layer change', pg_temp.set_layers(:BOOK1, '[{"id": 1, "type": "text", "text": "Chair Yoga!"}]'), 'OK 1');
select pg_temp.keys('layers');
select pg_temp.chk('layers move the key', pg_temp.moved('0b', 'layers') = 'key', pg_temp.moved('0b', 'layers'));
update public.cover_designs set bg = '#2F4A3A' where book_id = :BOOK1;
select pg_temp.keys('bg');
select pg_temp.chk('bg moves the key', pg_temp.moved('layers', 'bg') = 'key', pg_temp.moved('layers', 'bg'));
update public.cover_designs set layout = 'stack', last_remap = null where book_id = :BOOK1;
select pg_temp.keys('layout');
select pg_temp.chk('layout name and size note do not', pg_temp.moved('bg', 'layout') = '', pg_temp.moved('bg', 'layout'));
update public.cover_designs set layers = layers where book_id = :BOOK1;
select pg_temp.keys('same');
select pg_temp.chk('a save with the same values (rev + 1) does not', pg_temp.moved('layout', 'same') = '', pg_temp.moved('layout', 'same'));
select pg_temp.is('the same Print PDF downloaded again (54 pages)', pg_temp.pdf(:BOOK1, 54), 'OK 1');
select pg_temp.keys('again');
select pg_temp.chk('…moves neither the key nor today''s size (no PDF id in the key)', pg_temp.moved('same', 'again') = '', pg_temp.moved('same', 'again'));
select pg_temp.is('a Print PDF with 60 pages', pg_temp.pdf(:BOOK1, 60), 'OK 1');
select pg_temp.keys('pages');
select pg_temp.chk('…moves today''s size; the key waits for the remap', pg_temp.moved('again', 'pages') = 'fmt', pg_temp.moved('again', 'pages'));
select pg_temp.is('09 remaps (fmt saved)', pg_temp.refit(:BOOK1), 'OK 1');
select pg_temp.keys('remap');
select pg_temp.chk('…then the key moves', pg_temp.moved('pages', 'remap') = 'key', pg_temp.moved('pages', 'remap'));
update public.book_formats set paper = 'cream' where book_id = :BOOK1;
select pg_temp.keys('paper');
select pg_temp.chk('paper moves today''s size', pg_temp.moved('remap', 'paper') = 'fmt', pg_temp.moved('remap', 'paper'));
select pg_temp.chk('…and the Print PDF stays current (paper is not in format_key)', (select current from public.cover_pdf(:BOOK1)));
update public.book_formats set paper = 'white' where book_id = :BOOK1;
:OWNER
update public.books set subtitle = 'Gentle moves, seated' where id = :BOOK1;
:ASA
select pg_temp.chk('a subtitle edit stales the Print PDF: today''s size has no pages', public.cover_fmt(:BOOK1) ->> 'pages' is null and not (select current from public.cover_pdf(:BOOK1)));
:OWNER
update public.books set subtitle = 'Gentle moves' where id = :BOOK1;
:ASA
select pg_temp.chk('cover_key: null without a design (BOOK3)', public.cover_key(:BOOK3) is null);
select pg_temp.chk('cover_key and cover_fmt: null for B''s book', public.cover_key(:BOOKB) is null and public.cover_fmt(:BOOKB) is null);
select pg_temp.chk('cover_fmt: no format row is white paper (BOOK3)', public.cover_fmt(:BOOK3) = '{"trim": "6x9", "pages": null, "paper": "white"}');

-- ── 9. The export guard ──
select pg_temp.is('no design: cover_missing', pg_temp.cover_print(:BOOK2), 'P0001 cover_missing%');
select pg_temp.is('BOOK2 Print PDF', pg_temp.pdf(:BOOK2, 54), 'OK 1');
select pg_temp.is('BOOK2 design', pg_temp.design(:BOOK2, '[{"id": 1, "type": "text", "text": "Second Book"}]', '#1F3A5F'), 'OK 1');
update public.book_formats set drop_cap = true where book_id = :BOOK2;
select pg_temp.is('a stale Print PDF: cover_pdf_missing', pg_temp.cover_print(:BOOK2), 'P0001 cover_pdf_missing%');
update public.book_formats set drop_cap = false where book_id = :BOOK2;
select pg_temp.is('a fresh Print PDF with 60 pages', pg_temp.pdf(:BOOK2, 60), 'OK 1');
select pg_temp.is('layers laid out for 54 pages: cover_resized', pg_temp.cover_print(:BOOK2), 'P0001 cover_resized%');
select pg_temp.is('…the image too', pg_temp.cover_image(:BOOK2, 3712, 2775), 'P0001 cover_resized%');
select pg_temp.is('…and the Kindle JPG', pg_temp.cover_kindle(:BOOK2), 'P0001 cover_resized%');
select pg_temp.is('the 54-page Print PDF again', pg_temp.pdf(:BOOK2, 54), 'OK 1');
select pg_temp.is('an old key: cover_stale', pg_temp.cover_print(:BOOK2, null, '0123456789abcdef0123456789abcdef'), 'P0001 cover_stale%');
select pg_temp.is('a width 0.001 in off: cover_size', pg_temp.cover_print(:BOOK2, 12.3726), 'P0001 cover_size%');
select pg_temp.is('no inches: cover_size', pg_temp.err(format($f$insert into public.cover_exports (book_id, kind, settings_key, engine) values (%L, 'print', %L, 'e')$f$, :BOOK2, public.cover_key(:BOOK2))), 'P0001 cover_size%');
select pg_temp.is('the real book''s numbers: 12.3716 x 9.25, spine 0.1216', pg_temp.cover_print(:BOOK2, null, null, 'thumb', '''data:image/jpeg;base64,/9j/4AAQ'''), 'OK 1');
select pg_temp.chk('the server set page count 54 (not 999), the Print PDF id and the snapshot (layout, rev)',
  (select page_count = 54 and pdf_export_id = (select export_id from public.cover_pdf(:BOOK2)) and width_in = 12.3716 and spine_in = 0.1216 and height_in = 9.25
          and snapshot = jsonb_build_object('title', 'Second Book', 'subtitle', null, 'pen_name', 'Nora Hale', 'trim', '6x9', 'paper', 'white',
                                            'page_count', 54, 'layout', null, 'rev', 1)
     from public.cover_exports where book_id = :BOOK2 and kind = 'print' order by created_at desc, id desc limit 1));
select pg_temp.is('the full image, 3712 x 2775 (D16, rounded up)', pg_temp.cover_image(:BOOK2, 3712, 2775), 'OK 1');
select pg_temp.chk('…page count and Print PDF id set on the image row', (select page_count = 54 and pdf_export_id is not null and thumb is null
  from public.cover_exports where book_id = :BOOK2 and kind = 'image'));
select pg_temp.is('3711 px (the design''s rounding): cover_size', pg_temp.cover_image(:BOOK2, 3711, 2775), 'P0001 cover_size%');
select pg_temp.is('no px: cover_size', pg_temp.err(format($f$insert into public.cover_exports (book_id, kind, settings_key, engine) values (%L, 'image', %L, 'e')$f$, :BOOK2, public.cover_key(:BOOK2))), 'P0001 cover_size%');
select pg_temp.is('an image row with inches refused (check)', pg_temp.cover_image(:BOOK2, 3712, 2775, 'width_in', '12.3716'), '23514%');
select pg_temp.is('an image row with a thumbnail refused (check)', pg_temp.cover_image(:BOOK2, 3712, 2775, 'thumb', '''data:image/jpeg;base64,/9j/'''), '23514%');
select pg_temp.is('a Kindle JPG', pg_temp.cover_kindle(:BOOK2), 'OK 1');
select pg_temp.is('a Kindle JPG of 1599 px refused (check)', pg_temp.cover_kindle(:BOOK2, 1599), '23514%');
select pg_temp.chk('no page count or Print PDF id on a Kindle row', (select bool_and(page_count is null and pdf_export_id is null) from public.cover_exports where book_id = :BOOK2 and kind = 'kindle'));
select pg_temp.is('a print row with px refused (check)', pg_temp.cover_print(:BOOK2, null, null, 'width_px, height_px', '1600, 2560'), '23514%');
select pg_temp.is('kind "epub" refused (check)', pg_temp.err(format($f$insert into public.cover_exports (book_id, kind, settings_key, engine) values (%L, 'epub', %L, 'e')$f$, :BOOK2, public.cover_key(:BOOK2))), '23514%');
select pg_temp.expect('an export cannot change', $q$update public.cover_exports set engine = 'x'$q$, '42501%');
select pg_temp.expect('an export cannot be deleted', $q$delete from public.cover_exports$q$, '42501%');

-- Picture rights: every printed picture is A's, with the tick or a stock source.
select pg_temp.is('A''s ticked upload, Pixabay and Unsplash pictures', pg_temp.set_layers(:BOOK2, '[{"id": 1, "type": "image", "asset": "1a000000-0000-4000-8000-000000000001"},
  {"id": 2, "type": "image", "asset": "1a000000-0000-4000-8000-000000000003"}, {"id": 3, "type": "image", "asset": "1a000000-0000-4000-8000-000000000004"}]'), 'OK 1');
select pg_temp.is('…print', pg_temp.cover_print(:BOOK2), 'OK 1');
select pg_temp.is('a picture with no asset (a layout''s sample) is not checked here (R13 at STOP 6)', pg_temp.set_layers(:BOOK2, '[{"id": 1, "type": "image", "asset": null}, {"id": 2, "type": "image"}]'), 'OK 1');
select pg_temp.is('…print', pg_temp.cover_print(:BOOK2), 'OK 1');
select pg_temp.is('B''s picture', pg_temp.set_layers(:BOOK2, '[{"id": 1, "type": "image", "asset": "2b000000-0000-4000-8000-000000000001"}]'), 'OK 1');
select pg_temp.is('…cover_rights (print)', pg_temp.cover_print(:BOOK2), 'P0001 cover_rights%');
select pg_temp.is('…cover_rights (image)', pg_temp.cover_image(:BOOK2, 3712, 2775), 'P0001 cover_rights%');
select pg_temp.is('…cover_rights (kindle)', pg_temp.cover_kindle(:BOOK2), 'P0001 cover_rights%');
select pg_temp.is('a removed picture', pg_temp.set_layers(:BOOK2, '[{"id": 1, "type": "image", "asset": "1a000000-0000-4000-8000-000000000006"}]'), 'OK 1');
select pg_temp.is('…cover_rights', pg_temp.cover_print(:BOOK2), 'P0001 cover_rights%');
select pg_temp.is('an asset that is not a uuid', pg_temp.set_layers(:BOOK2, '[{"id": 1, "type": "image", "asset": "not-a-uuid"}]'), 'OK 1');
select pg_temp.is('…cover_rights, not an error', pg_temp.cover_print(:BOOK2), 'P0001 cover_rights%');
select pg_temp.is('the removed picture hidden, B''s excluded from export', pg_temp.set_layers(:BOOK2, '[{"id": 1, "type": "image", "asset": "1a000000-0000-4000-8000-000000000006", "hidden": true},
  {"id": 2, "type": "image", "asset": "2b000000-0000-4000-8000-000000000001", "noExport": true}]'), 'OK 1');
select pg_temp.is('…print (they do not print)', pg_temp.cover_print(:BOOK2), 'OK 1');
select pg_temp.is('BOOK2 back to text', pg_temp.set_layers(:BOOK2, '[{"id": 1, "type": "text", "text": "Second Book"}]'), 'OK 1');

-- Trim: a null trim (no Brief row) and a trim outside the 6, with a current Print PDF.
select pg_temp.is('BOOK5 design at 6 x 9', pg_temp.design(:BOOK5), 'OK 1');
update public.book_briefs set trim_size = '7x10' where book_id = :BOOK5;
select pg_temp.is('BOOK5 Print PDF at 7 x 10', pg_temp.pdf(:BOOK5, 54), 'OK 1');
select pg_temp.is('7 x 10: cover_trim', pg_temp.cover_print(:BOOK5), 'P0001 cover_trim%');
:OWNER
delete from public.book_briefs where book_id = :BOOK5;
:ASA
select pg_temp.is('BOOK5 Print PDF with no Brief row', pg_temp.pdf(:BOOK5, 54), 'OK 1');
select pg_temp.is('null trim: cover_trim (print)', pg_temp.cover_print(:BOOK5), 'P0001 cover_trim%');
select pg_temp.is('null trim: cover_trim (kindle)', pg_temp.cover_kindle(:BOOK5), 'P0001 cover_trim%');

-- The print size for the 6 trims × paper × 24, 54, 400 pages.
create function pg_temp.size_case(t text, p text, n int) returns text language plpgsql as $$
declare r text;
begin
  update public.book_briefs set trim_size = t where book_id = 'b0000000-0000-4000-8000-000000000002';
  update public.book_formats set paper = p where book_id = 'b0000000-0000-4000-8000-000000000002';
  r := pg_temp.pdf('b0000000-0000-4000-8000-000000000002', n);
  if r <> 'OK 1' then return 'pdf: ' || r; end if;
  r := pg_temp.refit('b0000000-0000-4000-8000-000000000002');
  if r <> 'OK 1' then return 'refit: ' || r; end if;
  return pg_temp.cover_print('b0000000-0000-4000-8000-000000000002');
end $$;
-- The image px for one case, pinned from kdpCover.geo.px300 (limits-parity reads these lines):
-- the exact size, then 1 px narrower and 1 px taller.
create function pg_temp.img_case(t text, p text, n int, w int, h int) returns text language plpgsql as $$
declare r text;
begin
  update public.book_briefs set trim_size = t where book_id = 'b0000000-0000-4000-8000-000000000002';
  update public.book_formats set paper = p where book_id = 'b0000000-0000-4000-8000-000000000002';
  r := pg_temp.pdf('b0000000-0000-4000-8000-000000000002', n);
  if r <> 'OK 1' then return 'pdf: ' || r; end if;
  r := pg_temp.refit('b0000000-0000-4000-8000-000000000002');
  if r <> 'OK 1' then return 'refit: ' || r; end if;
  return pg_temp.cover_image('b0000000-0000-4000-8000-000000000002', w, h) || ' / ' || pg_temp.cover_image('b0000000-0000-4000-8000-000000000002', w - 1, h)
    || ' / ' || pg_temp.cover_image('b0000000-0000-4000-8000-000000000002', w, h + 1);
end $$;
grant execute on all functions in schema pg_temp to public;
-- Each case is its own statement (its own server time), so "the last Print PDF" is the case's own.
select format('select pg_temp.is(%L, pg_temp.size_case(%L, %L, %s), %L)', format('size %s %s %s pages', t, p, n), t, p, n, 'OK 1')
  from unnest(array['6x9', '5.5x8.5', '5.25x8', '5x8', '8x10', '8.5x11']) with ordinality t(t, i), unnest(array['white', 'cream']) with ordinality p(p, j),
       unnest(array[24, 54, 400]) with ordinality n(n, m)
 order by i, j, m \gexec
select pg_temp.chk('8 x 10, white, 400 pages → 17.1508 x 10.25, spine 0.9008',
  (select width_in = 17.1508 and height_in = 10.25 and spine_in = 0.9008 from public.cover_exports
    where book_id = :BOOK2 and kind = 'print' and page_count = 400 and snapshot ->> 'trim' = '8x10' and snapshot ->> 'paper' = 'white'));
select pg_temp.chk('the last row: 8.5 x 11, cream, 400 pages → 18.25 x 11.25, spine 1.0',
  (select width_in = 18.25 and height_in = 11.25 and spine_in = 1 and page_count = 400 and snapshot ->> 'paper' = 'cream' and snapshot ->> 'trim' = '8.5x11'
     from public.cover_exports where book_id = :BOOK2 and kind = 'print' order by created_at desc, id desc limit 1));
select pg_temp.chk('20 print rows kept for BOOK2', (select count(*) from public.cover_exports where book_id = :BOOK2 and kind = 'print') = 20,
  (select count(*) from public.cover_exports where book_id = :BOOK2 and kind = 'print')::text);
select pg_temp.is('px300 6x9 white 54 pages: 3712 x 2775', pg_temp.img_case('6x9', 'white', 54, 3712, 2775), 'OK 1 / P0001 cover_size% / P0001 cover_size%');
select pg_temp.is('px300 6x9 cream 54 pages: 3716 x 2775', pg_temp.img_case('6x9', 'cream', 54, 3716, 2775), 'OK 1 / P0001 cover_size% / P0001 cover_size%');
select pg_temp.is('px300 5x8 white 24 pages: 3092 x 2475', pg_temp.img_case('5x8', 'white', 24, 3092, 2475), 'OK 1 / P0001 cover_size% / P0001 cover_size%');
select pg_temp.is('px300 5x8 cream 24 pages: 3093 x 2475', pg_temp.img_case('5x8', 'cream', 24, 3093, 2475), 'OK 1 / P0001 cover_size% / P0001 cover_size%');
select pg_temp.is('px300 5.25x8 white 120 pages: 3307 x 2475', pg_temp.img_case('5.25x8', 'white', 120, 3307, 2475), 'OK 1 / P0001 cover_size% / P0001 cover_size%');
select pg_temp.is('px300 5.25x8 cream 120 pages: 3315 x 2475', pg_temp.img_case('5.25x8', 'cream', 120, 3315, 2475), 'OK 1 / P0001 cover_size% / P0001 cover_size%');
select pg_temp.is('px300 5.5x8.5 white 80 pages: 3430 x 2625', pg_temp.img_case('5.5x8.5', 'white', 80, 3430, 2625), 'OK 1 / P0001 cover_size% / P0001 cover_size%');
select pg_temp.is('px300 5.5x8.5 cream 80 pages: 3435 x 2625', pg_temp.img_case('5.5x8.5', 'cream', 80, 3435, 2625), 'OK 1 / P0001 cover_size% / P0001 cover_size%');
select pg_temp.is('px300 8x10 white 54 pages: 4912 x 3075', pg_temp.img_case('8x10', 'white', 54, 4912, 3075), 'OK 1 / P0001 cover_size% / P0001 cover_size%');
select pg_temp.is('px300 8x10 cream 400 pages: 5175 x 3075', pg_temp.img_case('8x10', 'cream', 400, 5175, 3075), 'OK 1 / P0001 cover_size% / P0001 cover_size%');
select pg_temp.is('px300 8.5x11 white 828 pages: 5735 x 3375', pg_temp.img_case('8.5x11', 'white', 828, 5735, 3375), 'OK 1 / P0001 cover_size% / P0001 cover_size%');
select pg_temp.is('px300 8.5x11 cream 828 pages: 5796 x 3375', pg_temp.img_case('8.5x11', 'cream', 828, 5796, 3375), 'OK 1 / P0001 cover_size% / P0001 cover_size%');
select pg_temp.is('px300 6x9 white 2 pages: 3677 x 2775', pg_temp.img_case('6x9', 'white', 2, 3677, 2775), 'OK 1 / P0001 cover_size% / P0001 cover_size%');
select pg_temp.is('px300 6x9 cream 4 pages: 3678 x 2775', pg_temp.img_case('6x9', 'cream', 4, 3678, 2775), 'OK 1 / P0001 cover_size% / P0001 cover_size%');
select pg_temp.chk('image rows: the first one and one per exact case (15), none of the refused', (select count(*) from public.cover_exports where book_id = :BOOK2 and kind = 'image') = 15,
  (select count(*) from public.cover_exports where book_id = :BOOK2 and kind = 'image')::text);
update public.book_briefs set trim_size = '6x9' where book_id = :BOOK2;
update public.book_formats set paper = 'white' where book_id = :BOOK2;

-- ── 10. cover_marks ──
select pg_temp.is('BOOK2 Print PDF again', pg_temp.pdf(:BOOK2, 54), 'OK 1');
select pg_temp.is('BOOK2 refit', pg_temp.refit(:BOOK2), 'OK 1');
select pg_temp.is('BOOK2 print', pg_temp.cover_print(:BOOK2, null, null, 'thumb', '''data:image/jpeg;base64,/9j/4AAQ'''), 'OK 1');
select pg_temp.is('BOOK2 image', pg_temp.cover_image(:BOOK2, 3712, 2775), 'OK 1');
select pg_temp.is('BOOK2 kindle', pg_temp.cover_kindle(:BOOK2), 'OK 1');
select pg_temp.chk('marks: BOOK2 current, the three files current, the thumbnail',
  (select pdf_current and print_at is not null and print_changed = false and image_at is not null and image_changed = false
          and kindle_at is not null and kindle_changed = false and thumb = 'data:image/jpeg;base64,/9j/4AAQ'
     from public.cover_marks(:BOOK2)));
update public.cover_designs set bg = '#7A2E2E' where book_id = :BOOK2;
select pg_temp.chk('marks: a design change marks all three', (select print_changed and image_changed and kindle_changed from public.cover_marks(:BOOK2)));
update public.cover_designs set bg = '#1F3A5F' where book_id = :BOOK2;
select pg_temp.chk('marks: the same design again is current again', (select not print_changed and not image_changed and not kindle_changed from public.cover_marks(:BOOK2)));
update public.book_formats set paper = 'cream' where book_id = :BOOK2;
select pg_temp.chk('marks: a paper change marks all three before 09 opens again (the design is for white)',
  (select pdf_current and print_changed and image_changed and kindle_changed from public.cover_marks(:BOOK2)));
update public.book_formats set paper = 'white' where book_id = :BOOK2;
select pg_temp.chk('marks: BOOK1 has a Print PDF, no cover export', (select pdf_current and print_at is null and print_changed is null and image_changed is null and kindle_changed is null
  from public.cover_marks(:BOOK1)));
select pg_temp.chk('marks: BOOK3 (no PDF, no export) has no row', not exists (select 1 from public.cover_marks(:BOOK3)));
select pg_temp.chk('marks: all of A''s books with a PDF or an export (1, 2, 4, 5)', (select count(*) from public.cover_marks()) = 4, (select count(*) from public.cover_marks())::text);
select pg_temp.chk('marks: none of B''s books', not exists (select 1 from public.cover_marks() where book_id = :BOOKB));

-- ── 11. cover_json ──
insert into public.cover_blurbs (book_id, body, source) values (:BOOK1, 'Older blurb.', 'manual');
insert into public.cover_blurbs (book_id, body, source) values (:BOOK1, 'Newest blurb.', 'ai');
select pg_temp.is('BOOK1 uses A''s upload and the Unsplash picture', pg_temp.set_layers(:BOOK1, '[{"id": 1, "type": "image", "asset": "1a000000-0000-4000-8000-000000000001"},
  {"id": 2, "type": "image", "asset": "1a000000-0000-4000-8000-000000000004"}, {"id": 3, "type": "image", "asset": "2b000000-0000-4000-8000-000000000001"}, {"id": 4, "type": "text", "text": "x"}]'), 'OK 1');
select pg_temp.chk('cover_json: book, fmt, pdf, design, assets, blurb, my_layouts, key, last, now',
  (select array_agg(k order by k) from jsonb_object_keys(public.cover_json(:BOOK1)) k) = array['assets', 'blurb', 'book', 'design', 'fmt', 'key', 'last', 'my_layouts', 'now', 'pdf']);
select pg_temp.chk('cover_json: the design without user_id, with rev', not (public.cover_json(:BOOK1) -> 'design') ? 'user_id'
  and (public.cover_json(:BOOK1) -> 'design' ->> 'rev')::int = (select rev from public.cover_designs where book_id = :BOOK1));
select pg_temp.chk('cover_json: only the 2 of A''s pictures the design uses (not B''s), without user_id',
  jsonb_array_length(public.cover_json(:BOOK1) -> 'assets') = 2
  and (select bool_and(not a ? 'user_id') and array_agg(a ->> 'id' order by a ->> 'id') = array['1a000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-000000000004']
         from jsonb_array_elements(public.cover_json(:BOOK1) -> 'assets') a));
select pg_temp.chk('cover_json: the newest blurb', public.cover_json(:BOOK1) -> 'blurb' ->> 'body' = 'Newest blurb.');
select pg_temp.chk('cover_json: My layouts without layers, newest export first',
  jsonb_array_length(public.cover_json(:BOOK1) -> 'my_layouts') = 2
  and (select bool_and(not m ? 'layers' and m ? 'thumb' and m ? 'fmt') from jsonb_array_elements(public.cover_json(:BOOK1) -> 'my_layouts') m)
  and public.cover_json(:BOOK1) -> 'my_layouts' -> 0 ->> 'name' = 'Four');
select pg_temp.chk('cover_json: key and fmt equal the functions', public.cover_json(:BOOK1) ->> 'key' = public.cover_key(:BOOK1)
  and public.cover_json(:BOOK1) -> 'fmt' = public.cover_fmt(:BOOK1));
select pg_temp.chk('cover_json: the last image export with its px', (public.cover_json(:BOOK2) -> 'last' -> 'image' ->> 'width_px')::int = 3712
  and public.cover_json(:BOOK2) -> 'last' -> 'print' -> 'snapshot' ->> 'trim' = '6x9');
select pg_temp.chk('cover_json: BOOK3 has no design, no PDF, white paper', public.cover_json(:BOOK3) -> 'design' = 'null'::jsonb
  and public.cover_json(:BOOK3) -> 'pdf' = 'null'::jsonb and public.cover_json(:BOOK3) -> 'book' ->> 'paper' = 'white'
  and public.cover_json(:BOOK3) -> 'last' -> 'image' = 'null'::jsonb);
select pg_temp.chk('cover_json: B''s book is null for A', public.cover_json(:BOOKB) is null);

-- ── 12. Storage: the "covers" bucket and the new insert rule ──
:OWNER
select pg_temp.chk('bucket covers: private, 10 MB, JPEG and PNG',
  (select public = false and file_size_limit = 10485760 and allowed_mime_types = array['image/jpeg', 'image/png'] from storage.buckets where id = 'covers'));
select pg_temp.chk('storage policies: covers_select_own, covers_insert_asset, covers_delete_own (no update)',
  (select array_agg(policyname::text order by policyname) from pg_policies where schemaname = 'storage' and tablename = 'objects')
    = array['covers_delete_own', 'covers_insert_asset', 'covers_select_own']);
:ASA
select pg_temp.expect('A uploads A/assets/<id>.jpg', $q$insert into storage.objects (bucket_id, name) values ('covers', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000001.jpg')$q$, 'OK 1');
select pg_temp.expect('A uploads A/assets/<id>.png', $q$insert into storage.objects (bucket_id, name) values ('covers', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000002.png')$q$, 'OK 1');
select pg_temp.expect('the old A/<book>/<id>.jpg path refused', $q$insert into storage.objects (bucket_id, name) values ('covers', '00000000-0000-4000-8000-00000000000a/b0000000-0000-4000-8000-000000000001/1a000000-0000-4000-8000-000000000001.jpg')$q$, '42501%');
select pg_temp.expect('B''s folder refused', $q$insert into storage.objects (bucket_id, name) values ('covers', '00000000-0000-4000-8000-00000000000b/assets/1a000000-0000-4000-8000-000000000001.jpg')$q$, '42501%');
select pg_temp.expect('"asset" (not "assets") refused', $q$insert into storage.objects (bucket_id, name) values ('covers', '00000000-0000-4000-8000-00000000000a/asset/1a000000-0000-4000-8000-000000000001.jpg')$q$, '42501%');
select pg_temp.expect('.gif refused', $q$insert into storage.objects (bucket_id, name) values ('covers', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000001.gif')$q$, '42501%');
select pg_temp.expect('.JPG refused', $q$insert into storage.objects (bucket_id, name) values ('covers', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000001.JPG')$q$, '42501%');
select pg_temp.expect('a deeper folder refused', $q$insert into storage.objects (bucket_id, name) values ('covers', '00000000-0000-4000-8000-00000000000a/assets/x/1a000000-0000-4000-8000-000000000001.jpg')$q$, '42501%');
select pg_temp.expect('a name that is not a uuid refused', $q$insert into storage.objects (bucket_id, name) values ('covers', '00000000-0000-4000-8000-00000000000a/assets/photo.jpg')$q$, '42501%');
select pg_temp.expect('an upper-case uuid refused', $q$insert into storage.objects (bucket_id, name) values ('covers', '00000000-0000-4000-8000-00000000000a/assets/1A000000-0000-4000-8000-000000000001.jpg')$q$, '42501%');
select pg_temp.expect('another bucket refused', $q$insert into storage.objects (bucket_id, name) values ('other', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000001.jpg')$q$, '42501%');
select pg_temp.expect('A reads A''s 2 files', $q$select 1 from storage.objects where bucket_id = 'covers'$q$, 'OK 2');
select pg_temp.expect('A cannot change a file (no update policy)', $q$update storage.objects set name = name where bucket_id = 'covers'$q$, 'OK 0');
:ANON
select pg_temp.expect('anon reads no file', $q$select 1 from storage.objects$q$, 'OK 0');
select pg_temp.expect('anon cannot upload', $q$insert into storage.objects (bucket_id, name) values ('covers', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000009.jpg')$q$, '42501%');
:ASA
select pg_temp.expect('A deletes A''s files', $q$delete from storage.objects where bucket_id = 'covers'$q$, 'OK 2');

-- ── 13. A book delete: design and snapshots go; pictures and My layouts stay ──
select pg_temp.chk('BOOK4 has a design, 20 snapshots, a picture and a My layout before the delete',
  exists (select 1 from public.cover_designs where book_id = :BOOK4) and (select count(*) from public.cover_design_history where book_id = :BOOK4) = 20
  and exists (select 1 from public.cover_assets where origin_book_id = :BOOK4) and exists (select 1 from public.cover_my_layouts where from_book_id = :BOOK4));
select (select exported_at from public.cover_my_layouts where id = '2c000000-0000-4000-8000-000000000004') as t \gset my4_
select pg_temp.expect('A deletes BOOK4 (set null runs through the guards)', $q$delete from public.books where id = 'b0000000-0000-4000-8000-000000000004'$q$, 'OK 1');
select pg_temp.chk('the design and the snapshots went with the book', not exists (select 1 from public.cover_designs where book_id = :BOOK4)
  and not exists (select 1 from public.cover_design_history where book_id = :BOOK4));
select pg_temp.chk('the picture stays, its origin is null', (select origin_book_id is null from public.cover_assets where id = '1a000000-0000-4000-8000-000000000005'));
select pg_temp.chk('the My layout stays with no book, its export time unchanged',
  (select from_book_id is null and exported_at = :'my4_t'::timestamptz from public.cover_my_layouts where id = '2c000000-0000-4000-8000-000000000004'));

-- ── 14. anon: every 0030 function and table refused ──
:ANON
select pg_temp.expect(f || ': anon refused', format('select %s', replace(replace(replace(f, '(uuid)', '(null::uuid)'), '(jsonb)', '(null::jsonb)'), '(text)', '(null::text)')), '42501%')
  from fns30 order by f;
select pg_temp.chk(t || ': anon reads nothing', pg_temp.err(format('select 1 from public.%I', t)) = 'OK 0' or pg_temp.err(format('select 1 from public.%I', t)) like '42501%',
                   pg_temp.err(format('select 1 from public.%I', t)))
  from unnest(array['cover_designs', 'cover_design_history', 'cover_assets', 'cover_my_layouts', 'cover_exports']) t order by t;
:OWNER
