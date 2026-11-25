-- 0035 upgrade (E17 Part 1): old data is made on a database with 0001 to 0034,
-- then 0035 is applied to it. R1 and C5: format_key, epub_key and every
-- "changed" mark stay the same when no new part is on. Backfill counts, the
-- Q-1 About seed, and no book moves on the Books page.
-- Run: supabase/tests/sql/run.sh t0035_up.sql
\ir helpers.sql

\set A '''00000000-0000-4000-8000-00000000000a'''
\set ASA 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-4000-8000-00000000000a'';'
\set OWNER 'reset role; reset request.jwt.claim.sub;'
\set P1 '''e0000000-0000-4000-8000-000000000001'''
\set P2 '''e0000000-0000-4000-8000-000000000002'''
\set P3 '''e0000000-0000-4000-8000-000000000003'''
\set OWNERLIKE '''b0000000-0000-4000-8000-000000000001'''
\set PLAIN '''b0000000-0000-4000-8000-000000000002'''
\set ALSO '''b0000000-0000-4000-8000-000000000003'''
\set NOBIO '''b0000000-0000-4000-8000-000000000004'''
\set NOPEN '''b0000000-0000-4000-8000-000000000005'''
\set NOFMT '''b0000000-0000-4000-8000-000000000006'''
\set ALSOEMPTY '''b0000000-0000-4000-8000-000000000007'''
\set LISTOFF '''b0000000-0000-4000-8000-000000000008'''
\set GONE '''b0000000-0000-4000-8000-0000000000ff'''
\set OTHERPEN '''b0000000-0000-4000-8000-000000000009'''

select pg_temp.chk('before: no book_parts table (the database stops before 0035)', to_regclass('public.book_parts') is null);

insert into auth.users values (:A);
insert into public.pen_names (id, user_id, name, bio_text) values
  (:P1, :A, 'Nora Hale', E'Nora teaches chair yoga.\n\nShe says "start small" & <breathe> # every day.'),
  (:P2, :A, 'No Bio Pen', null),
  (:P3, :A, 'Third Pen', 'Third bio.');
insert into public.books (id, user_id, pen_name_id, title, subtitle, created_at) values
  (:OWNERLIKE, :A, :P1, 'Chair Yoga for Seniors', 'Gentle moves', '2026-10-01 10:00+00'),
  (:PLAIN, :A, :P1, 'Plain Book', 'Sub two', '2026-10-02 10:00+00'),
  (:ALSO, :A, :P1, 'Also Book', null, '2026-10-03 10:00+00'),
  (:NOBIO, :A, :P2, 'No Bio Book', null, '2026-10-04 10:00+00'),
  (:NOPEN, :A, null, 'No Pen Book', null, '2026-10-05 10:00+00'),
  (:NOFMT, :A, :P1, 'No Format Book', null, '2026-10-06 10:00+00'),
  (:ALSOEMPTY, :A, :P1, 'Empty Also', null, '2026-10-07 10:00+00'),
  (:LISTOFF, :A, :P1, 'List Off', null, '2026-10-08 10:00+00'),
  (:OTHERPEN, :A, :P3, 'Other Pen Book', 'x', '2026-10-09 10:00+00');
insert into public.chapters (id, user_id, book_id, position, kind, title)
select ('c' || substr(b.id::text, 2))::uuid, b.user_id, b.id, 1, 'chapter', 'One' from public.books b;
insert into public.sections (id, user_id, chapter_id, position, title, status)
select ('d' || substr(c.book_id::text, 2))::uuid, c.user_id, c.id, 1, 'S', 'final' from public.chapters c;
insert into public.section_versions (id, user_id, section_id, version_no, content, source)
select ('f' || substr(s.id::text, 2))::uuid, s.user_id, s.id, 1, 'Text.', 'manual' from public.sections s;
update public.sections set current_version_id = ('f' || substr(id::text, 2))::uuid;

insert into public.book_formats (book_id, user_id)
select b.id, b.user_id from public.books b where b.id <> :NOFMT;
-- Owner-like: About on, no other part. Also: two ticks, one deleted book, one other pen.
update public.book_formats set parts = parts || '{"about": true}' where book_id in (:OWNERLIKE, :NOBIO, :NOPEN);
-- Stale ticks as they happen in life: ticked while valid, then the book is
-- deleted or gets another pen name.
insert into public.books (id, user_id, pen_name_id, title) values (:GONE, :A, :P1, 'Soon gone');
update public.books set pen_name_id = :P1 where id in (:OTHERPEN, :NOBIO);
update public.book_formats set parts = parts || '{"also_by": true}', also_by = array[:PLAIN, :GONE, :OTHERPEN, :NOBIO, :OWNERLIKE]::uuid[]
 where book_id = :ALSO;
delete from public.books where id = :GONE;
update public.books set pen_name_id = :P3 where id = :OTHERPEN;
update public.books set pen_name_id = :P2 where id = :NOBIO;
update public.book_formats set parts = parts || '{"also_by": true}' where book_id = :ALSOEMPTY;
update public.book_formats set also_by = array[:PLAIN]::uuid[] where book_id = :LISTOFF;

-- One export of each kind per book with a format row, with About as in 08.
insert into public.book_exports (user_id, book_id, format, include, parts, versions, page_count, settings_key, engine, created_at)
select f.user_id, f.book_id, 'pdf', 'final', f.parts - 'also_by', public.pdf_version_ids(f.book_id), 40,
       public.format_key(f.book_id), 'typst 0.14.2 · t1', '2026-10-20 10:00+00'
  from public.book_formats f;
insert into public.book_exports (user_id, book_id, format, include, parts, versions, settings_key, engine, created_at)
select f.user_id, f.book_id, 'epub', 'final', (f.parts - 'also_by') || '{"contents": true}', public.pdf_version_ids(f.book_id),
       public.epub_key(f.book_id), 'epub3 · e1', '2026-10-20 11:00+00'
  from public.book_formats f;
-- DOCX: every book, About ticked in the dialog (also where 08 has it off).
insert into public.book_exports (user_id, book_id, format, include, parts, versions, created_at)
select b.user_id, b.id, 'docx', 'final',
       '{"title": true, "copyright": true, "contents": true, "intro": true, "conclusion": true, "about": true}',
       array[('f' || substr(b.id::text, 2))::uuid], '2026-10-20 12:00+00'
  from public.books b;

-- One 07 run for every book, current when saved; then two of them go stale
-- (a section target is a 07 input only): one book with no part, one with.
insert into public.qc_runs (user_id, book_id, versions, inputs_key, results, sections, words, style)
select b.user_id, b.id, public.qc_versions(b.id), public.qc_inputs_key(b.id),
       '{"items": [], "more": {}, "sources": [], "notes": {"unsaved": 0, "running": 0}}', 1, 1, 'classic'
  from public.books b;
update public.chapters set objective = 'Changed after the run' where book_id in (:LISTOFF, :ALSOEMPTY);

create temp table qc_snap as
select b.id, public.qc_inputs_key(b.id) as key, (select current from public.qc_mark(b.id)) as cur
  from public.books b;
create temp table names (id uuid primary key, n text);
insert into names values (:OWNERLIKE, 'owner-like (About on)'), (:PLAIN, 'plain'), (:ALSO, 'Also by on, 3 live ticks'),
  (:NOBIO, 'About on, no bio'), (:NOPEN, 'About on, no pen'), (:NOFMT, 'no format row'),
  (:ALSOEMPTY, 'Also by on, empty list'), (:LISTOFF, 'Also by off, 1 tick'), (:OTHERPEN, 'other pen');

create temp table snap as
select b.id, public.format_key(b.id) as fk, public.epub_key(b.id) as ek, b.updated_at,
       (select changed from public.pdf_marks(b.id)) as pdf, (select changed from public.epub_marks(b.id)) as epub,
       (select e.changed from public.export_badges() e where e.book_id = b.id) as docx,
       public.pdf_version_ids(b.id) as vers
  from public.books b;
create temp table old_counts as
select (select count(*) from public.books) as books,
       (select coalesce(sum(cardinality(also_by)), 0) from public.book_formats) as also_elements,
       (select count(*) from public.book_formats f cross join lateral unnest(f.also_by) u(x)
          join public.books o on o.id = u.x and o.user_id = f.user_id and o.id <> f.book_id) as also_live,
       (select count(*) from public.book_formats where (parts ->> 'about')::boolean) as about_on,
       (select count(*) from public.book_formats where (parts ->> 'also_by')::boolean) as also_on,
       (select count(*) from public.book_exports) as exports;
grant select on names, snap, old_counts to public;

select pg_temp.chk('before: every mark is current (pdf, epub, docx)', not exists (
  select 1 from snap where coalesce(pdf, false) or coalesce(epub, false) or coalesce(docx, false)),
  (select string_agg(n.n || ' ' || concat_ws('/', s.pdf, s.epub, s.docx), '; ') from snap s join names n using (id)));
create temp table qc_rows as select md5(coalesce(string_agg(r::text, ',' order by r::text), '')) as d from public.qc_runs r;
grant select on qc_snap to public;
select pg_temp.chk('before: 7 runs current, 2 stale', (select count(*) filter (where cur) = 7 and count(*) filter (where not cur) = 2 from qc_snap));
create temp table cover_before as select md5(coalesce(string_agg(t::text, ',' order by t::text), '')) as d from public.book_formats t;

-- ── Apply 0035, in one transaction as the live apply does ──
begin;
\ir ../../migrations/0035_book_parts.sql
commit;

-- ── Keys ──
select 'KEY ' || rpad(n.n, 26) || ' format ' || coalesce(s.fk, 'null') || ' -> ' || coalesce(public.format_key(s.id), 'null')
       || '  epub ' || coalesce(s.ek, 'null') || ' -> ' || coalesce(public.epub_key(s.id), 'null')
  from snap s join names n using (id) order by s.id;
select pg_temp.chk('C5 ' || n.n || ': format_key and epub_key unchanged',
         public.format_key(s.id) is not distinct from s.fk and public.epub_key(s.id) is not distinct from s.ek)
  from snap s join names n using (id) where s.id <> :ALSO order by s.id;
select pg_temp.chk('C5 owner-like: keys are not null, About is on and Final',
  (select s.fk is not null and s.ek is not null from snap s where s.id = :OWNERLIKE)
  and (select enabled and status = 'final' from public.book_parts where book_id = :OWNERLIKE and kind = 'about_author'));
select pg_temp.chk('Also by with live ticks: both keys change (titles only now, as planned)',
  public.format_key(:ALSO) <> (select fk from snap where id = :ALSO) and public.epub_key(:ALSO) <> (select ek from snap where id = :ALSO));

-- ── Marks ──
select pg_temp.chk('marks ' || n.n || ': pdf, epub, docx as before',
         (select changed from public.pdf_marks(s.id)) is not distinct from s.pdf
         and (select changed from public.epub_marks(s.id)) is not distinct from s.epub
         and (select e.changed from public.export_badges() e where e.book_id = s.id) is not distinct from s.docx,
         concat_ws('/', (select changed from public.pdf_marks(s.id)), (select changed from public.epub_marks(s.id)),
                   (select e.changed from public.export_badges() e where e.book_id = s.id)))
  from snap s join names n using (id) where s.id <> :ALSO order by s.id;
select pg_temp.chk('marks Also by: pdf and epub changed, docx not (an old DOCX had no Also by)',
  (select changed from public.pdf_marks(:ALSO)) and (select changed from public.epub_marks(:ALSO))
  and not (select changed from public.export_badges() where book_id = :ALSO));
select pg_temp.chk('no book moved: books.updated_at unchanged', not exists (
  select 1 from public.books b join snap s using (id) where b.updated_at is distinct from s.updated_at));
select pg_temp.chk('pdf_version_ids unchanged', not exists (
  select 1 from snap s where public.pdf_version_ids(s.id) is distinct from s.vers));
select pg_temp.chk('book_formats rows untouched (0036 removes the old columns later)',
  (select md5(coalesce(string_agg(t::text, ',' order by t::text), '')) from public.book_formats t) = (select d from cover_before));
select pg_temp.chk('export rows untouched in number', (select count(*) from public.book_exports) = (select exports from old_counts));

-- ── 07 ──
-- No part on: key and mark as before. About or Also by on: out of date once.
select pg_temp.chk('07 ' || n.n || ': no part on, key and mark unchanged',
         public.qc_inputs_key(q.id) = q.key and (select current from public.qc_mark(q.id)) = q.cur)
  from qc_snap q join names n using (id)
 where not exists (select 1 from public.book_parts p where p.book_id = q.id and p.enabled) order by q.id;
select pg_temp.chk('07 ' || n.n || ': a part is on, the key changed and the run is out of date',
         public.qc_inputs_key(q.id) <> q.key and not (select current from public.qc_mark(q.id)))
  from qc_snap q join names n using (id)
 where exists (select 1 from public.book_parts p where p.book_id = q.id and p.enabled) order by q.id;
select pg_temp.chk('07: 4 books with no part on, 5 with About or Also by on',
  (select count(distinct book_id) from public.book_parts where enabled) = 5);
select pg_temp.chk('07: no saved run is rewritten',
  (select md5(coalesce(string_agg(r::text, ',' order by r::text), '')) from public.qc_runs r) = (select d from qc_rows));
select 'QC ' || rpad(n.n, 26) || ' current ' || q.cur || ' -> ' || (select current from public.qc_mark(q.id))
  from qc_snap q join names n using (id) order by q.id;

-- ── Backfill counts ──
select 'COUNT books=' || o.books || ' book_parts=' || (select count(*) from public.book_parts)
    || ' | old also_by elements=' || o.also_elements || ' existing=' || o.also_live
    || ' book_also_by rows=' || (select count(*) from public.book_also_by)
    || ' | format About on=' || o.about_on || ' parts About on=' || (select count(*) from public.book_parts where kind = 'about_author' and enabled)
    || ' | format Also by on=' || o.also_on || ' parts Also by on=' || (select count(*) from public.book_parts where kind = 'also_by' and enabled)
    || ' | About versions seeded=' || (select count(*) from public.book_part_versions)
  from old_counts o;
select pg_temp.chk('8 parts for every book',
  (select count(*) from public.book_parts) = 8 * (select books from old_counts)
  and not exists (select 1 from public.books b where (select count(distinct kind) from public.book_parts p where p.book_id = b.id) <> 8));
select pg_temp.chk('every existing Also by book became a row (no row lost); the deleted id has none',
  (select count(*) from public.book_also_by) = (select also_live from old_counts)
  and (select also_elements - also_live from old_counts) = 1);
select pg_temp.chk('positions are the old array positions',
  (select array_agg(position order by position) from public.book_also_by where book_id = :ALSO) = array[1, 3, 4, 5]
  and (select array_agg(other_book_id order by position) from public.book_also_by where book_id = :ALSO)
      = array[:PLAIN, :OTHERPEN, :NOBIO, :OWNERLIKE]::uuid[]);
select pg_temp.chk('ticks with another pen name are kept and not valid',
  (select array_agg(valid order by list_position) from public.also_by_entries(:ALSO)) = array[true, false, false, true]);
select pg_temp.chk('About on and Also by on copied',
  (select count(*) from public.book_parts where kind = 'about_author' and enabled) = (select about_on from old_counts)
  and (select count(*) from public.book_parts where kind = 'also_by' and enabled) = (select also_on from old_counts));
select pg_temp.chk('no other part is on', not exists (
  select 1 from public.book_parts where enabled and kind not in ('about_author', 'also_by')));
select pg_temp.chk('Q-1: only the book with About on and a bio is seeded, Final, bio_copy, the same bytes',
  (select count(*) from public.book_part_versions) = 1
  and (select v.content = pn.bio_text and v.source = 'bio_copy' and v.version_no = 1 and p.status = 'final' and v.word_count > 0
         from public.book_parts p join public.book_part_versions v on v.id = p.current_version_id
         join public.books b on b.id = p.book_id join public.pen_names pn on pn.id = b.pen_name_id
        where p.book_id = :OWNERLIKE and p.kind = 'about_author'));
select pg_temp.chk('the other text parts are Draft', not exists (
  select 1 from public.book_parts where status = 'final' and not (book_id = :OWNERLIKE and kind = 'about_author')));

-- ── After 0035: old exports and new changes ──
:ASA
-- A new part with Final text on a book with an old DOCX: changed.
select public.save_part_version((select id from public.book_parts where book_id = :PLAIN and kind = 'dedication'), 'For Sam.', null);
update public.book_parts set enabled = true where book_id = :PLAIN and kind = 'dedication';
select pg_temp.chk('a Draft part that is on: DOCX still current', not (select changed from public.export_badges() where book_id = :PLAIN));
update public.book_parts set status = 'final' where book_id = :PLAIN and kind = 'dedication';
select pg_temp.chk('old DOCX, new Final dedication: changed', (select changed from public.export_badges() where book_id = :PLAIN));
select pg_temp.chk('and the PDF and EPUB marks are changed',
  (select changed from public.pdf_marks(:PLAIN)) and (select changed from public.epub_marks(:PLAIN)));
update public.book_parts set enabled = false where book_id = :PLAIN and kind = 'dedication';
select pg_temp.chk('part off again: keys are the pre-0035 keys again',
  public.format_key(:PLAIN) = (select fk from snap where id = :PLAIN) and public.epub_key(:PLAIN) = (select ek from snap where id = :PLAIN));
-- The owner-like book: a new About text flips all three marks.
select public.save_part_version(p.id, 'A new About text.', p.current_version_id)
  from public.book_parts p where p.book_id = :OWNERLIKE and p.kind = 'about_author';
select pg_temp.chk('owner-like: a new About text flips pdf, epub and docx',
  (select changed from public.pdf_marks(:OWNERLIKE)) and (select changed from public.epub_marks(:OWNERLIKE))
  and (select changed from public.export_badges() where book_id = :OWNERLIKE));
