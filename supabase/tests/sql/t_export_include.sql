-- E11 include rule (owner note, STOP 2): the Export dialog (js/export-rules.js)
-- and export_badges (0025) must choose the same sections, or the Books badge
-- says "Changed" right after an export. Both sides read the same cases from
-- tests/fixtures/export-include.json: tests/export-rules.test.js checks the
-- dialog picks exactly `expected`; this file records an export with exactly
-- that list (as the dialog does) and checks export_badges says not changed.
-- It also checks that a list one section off reads as changed.
-- Run from the repo root: supabase/tests/sql/run.sh t_export_include.sql
\ir helpers.sql
\set fx `cat "$(git rev-parse --show-toplevel)/tests/fixtures/export-include.json"`

select set_config('kdp.fx', :'fx', false) is not null as fx_loaded \gset
insert into auth.users values ('00000000-0000-4000-8000-00000000000a');

create function pg_temp.vid(c text, k text) returns uuid language sql immutable as $$ select md5(c || ':' || k)::uuid $$;
create function pg_temp.list(c jsonb, drop_last boolean default false) returns uuid[] language sql immutable as $$
  select coalesce(array_agg(pg_temp.vid(c ->> 'name', k) order by o), '{}')
    from jsonb_array_elements_text(c -> 'expected') with ordinality x(k, o)
   where not drop_last or o < jsonb_array_length(c -> 'expected') $$;
grant execute on all functions in schema pg_temp to public;

-- Seed every case as its own book (as the owner of the database), then record
-- the dialog's list as the first DOCX export.
do $$
declare
  fx jsonb := current_setting('kdp.fx')::jsonb;
  cs jsonb; ch jsonb; se jsonb;
  uid uuid := '00000000-0000-4000-8000-00000000000a';
  b uuid; c uuid; s uuid; v uuid;
begin
  for cs in select * from jsonb_array_elements(fx -> 'cases') loop
    b := md5((cs ->> 'name') || ':book')::uuid;
    insert into public.books (id, user_id, title) values (b, uid, cs ->> 'name');
    insert into public.book_briefs (book_id, user_id, trim_size) values (b, uid, '6x9');
    for ch in select * from jsonb_array_elements(fx -> 'books' -> (cs ->> 'book')) loop
      c := md5((cs ->> 'name') || ':c:' || (ch ->> 'key'))::uuid;
      insert into public.chapters (id, user_id, book_id, position, kind, title)
        values (c, uid, b, (ch ->> 'position')::int, ch ->> 'kind', ch ->> 'key');
      for se in select * from jsonb_array_elements(ch -> 'sections') loop
        s := md5((cs ->> 'name') || ':s:' || (se ->> 'key'))::uuid;
        insert into public.sections (id, user_id, chapter_id, position, title, status)
          values (s, uid, c, (se ->> 'position')::int, se ->> 'key', se ->> 'status');
        if jsonb_typeof(se -> 'content') = 'string' then
          v := pg_temp.vid(cs ->> 'name', se ->> 'key');
          insert into public.section_versions (id, user_id, section_id, version_no, content, source, partial)
            values (v, uid, s, 1, se ->> 'content', 'manual', coalesce((se ->> 'partial')::boolean, false));
          update public.sections set current_version_id = v where id = s;
        end if;
        if coalesce((se ->> 'running')::boolean, false) then
          insert into public.section_runs (section_id, user_id, book_id, run_id, state) values (s, uid, b, gen_random_uuid(), 'running');
        end if;
      end loop;
    end loop;
    insert into public.book_exports (user_id, book_id, format, include, parts, versions, created_at)
      values (uid, b, 'docx', cs ->> 'include', cs -> 'parts', pg_temp.list(cs), '2030-01-01 00:00+00');
  end loop;
end $$;

create temp table cases as select c from jsonb_array_elements(current_setting('kdp.fx')::jsonb -> 'cases') c;
grant select on cases to public;

select pg_temp.chk('5 cases seeded', (select count(*) from cases) = 5 and (select count(*) from public.book_exports) = 5);

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.chk((c ->> 'name') || ': the dialog''s list reads as not changed',
         (select changed = false from public.export_badges() where book_id = md5((c ->> 'name') || ':book')::uuid),
         (select changed::text from public.export_badges() where book_id = md5((c ->> 'name') || ':book')::uuid))
  from cases order by c ->> 'name';
reset role;

-- A list one section short (a newer DOCX export) reads as changed.
insert into public.book_exports (user_id, book_id, format, include, parts, versions, created_at)
  select '00000000-0000-4000-8000-00000000000a', md5((c ->> 'name') || ':book')::uuid, 'docx', c ->> 'include', c -> 'parts', pg_temp.list(c, true), '2030-01-02 00:00+00'
    from cases where jsonb_array_length(c -> 'expected') > 1;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.chk((c ->> 'name') || ': one section short reads as changed',
         (select changed from public.export_badges() where book_id = md5((c ->> 'name') || ':book')::uuid))
  from cases where jsonb_array_length(c -> 'expected') > 1 order by c ->> 'name';
reset role;
