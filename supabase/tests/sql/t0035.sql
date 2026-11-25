-- 0035 book parts (E17 Part 1): the books trigger, grants and RLS (users A, B
-- and anon), the guards, versions and drafts, copy_bio_to_about, set_also_by,
-- part_file_list, the keys, the Q-11 trigger, suggestions, the 07 rule ids,
-- exports and badges, and deletes. The upgrade of old data is t0035_up.sql.
-- Run: supabase/tests/sql/run.sh t0035.sql
\ir helpers.sql

\set A '''00000000-0000-4000-8000-00000000000a'''
\set B '''00000000-0000-4000-8000-00000000000b'''
\set ASA 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-4000-8000-00000000000a'';'
\set ASB 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-4000-8000-00000000000b'';'
\set ANON 'reset request.jwt.claim.sub; set role anon;'
\set SERVICE 'reset request.jwt.claim.sub; set role service_role;'
\set OWNER 'reset role; reset request.jwt.claim.sub;'
\set P1 '''e0000000-0000-4000-8000-000000000001'''
\set P2 '''e0000000-0000-4000-8000-000000000002'''
\set PB '''e0000000-0000-4000-8000-00000000000b'''
\set BOOK1 '''b0000000-0000-4000-8000-000000000001'''
\set BOOK2 '''b0000000-0000-4000-8000-000000000002'''
\set BOOK3 '''b0000000-0000-4000-8000-000000000003'''
\set BOOK4 '''b0000000-0000-4000-8000-000000000004'''
\set BOOKB '''b0000000-0000-4000-8000-00000000000b'''

-- The part id of a book and kind, and the part's current version (read as the caller).
create function pg_temp.part(b uuid, k text) returns uuid language sql stable as $$
  select id from public.book_parts where book_id = b and kind = k $$;
create function pg_temp.cur(b uuid, k text) returns uuid language sql stable as $$
  select current_version_id from public.book_parts where book_id = b and kind = k $$;
-- Saves a text as the current version.
create function pg_temp.save(b uuid, k text, t text) returns jsonb language sql as $$
  select public.save_part_version(pg_temp.part(b, k), t, pg_temp.cur(b, k)) $$;
create function pg_temp.entries(b uuid, e jsonb) returns text language sql as $$
  select pg_temp.err(format('select public.set_also_by(%L, %L)', b, e)) $$;
create function pg_temp.files(b uuid) returns text language sql stable as $$
  select coalesce(string_agg(kind, ',' order by ord), '') from public.part_file_list(b) $$;
grant execute on all functions in schema pg_temp to public;

insert into auth.users values (:A), (:B);
insert into public.pen_names (id, user_id, name, bio_text) values
  (:P1, :A, 'Nora Hale', 'Nora teaches chair yoga.'), (:P2, :A, 'Other Pen', null), (:PB, :B, 'Pen B', 'B bio.');

-- ── The books trigger (as a signed-in user: no insert policy on book_parts) ──
:ASA
insert into public.books (id, pen_name_id, title, subtitle, created_at) values
  (:BOOK1, :P1, 'Chair Yoga', 'Gentle moves', '2026-10-01 10:00+00'),
  (:BOOK2, :P1, 'Second Book', 'Part two', '2026-10-02 10:00+00'),
  (:BOOK3, :P1, 'Third Book', null, '2026-10-03 10:00+00'),
  (:BOOK4, :P2, 'Other Pen Book', null, '2026-10-04 10:00+00');
:ASB
insert into public.books (id, pen_name_id, title) values (:BOOKB, :PB, 'B Book');
:OWNER
select pg_temp.chk('every new book has its 8 parts, all off, with its owner',
  (select count(*) = 40 and bool_and(not p.enabled and p.current_version_id is null and p.user_id = b.user_id)
     from public.book_parts p join public.books b on b.id = p.book_id));
select pg_temp.chk('text parts start Draft; review_request and also_by have no status',
  (select bool_and(case when kind in ('review_request', 'also_by') then status is null else status = 'draft' end) from public.book_parts));
insert into public.book_formats (book_id, user_id) values (:BOOK1, :A), (:BOOKB, :B);
insert into public.chapters (id, user_id, book_id, position, kind, title) values ('c0000000-0000-4000-8000-000000000001', :A, :BOOK1, 1, 'chapter', 'One');
insert into public.sections (id, user_id, chapter_id, position, title, status) values ('d0000000-0000-4000-8000-000000000001', :A, 'c0000000-0000-4000-8000-000000000001', 1, 'S', 'final');
insert into public.section_versions (id, user_id, section_id, version_no, content, source) values ('f0000000-0000-4000-8000-000000000001', :A, 'd0000000-0000-4000-8000-000000000001', 1, 'Text.', 'manual');
update public.sections set current_version_id = 'f0000000-0000-4000-8000-000000000001' where id = 'd0000000-0000-4000-8000-000000000001';

-- ── Tables, grants, functions ──
select pg_temp.chk('39 public tables, RLS on the 5 new ones',
  (select count(*) from pg_tables where schemaname = 'public') = 39
  and (select count(*) = 5 and bool_and(relrowsecurity) from pg_class where relnamespace = 'public'::regnamespace
        and relname in ('book_parts', 'book_part_versions', 'book_part_drafts', 'book_also_by', 'part_suggestions')),
  (select count(*) from pg_tables where schemaname = 'public')::text);
select pg_temp.chk('anon has no privilege on ' || t, not exists (
    select 1 from unnest(array['select', 'insert', 'update', 'delete', 'truncate']) x where has_table_privilege('anon', 'public.' || t, x)))
  from unnest(array['book_parts', 'book_part_versions', 'book_part_drafts', 'book_also_by', 'part_suggestions']) t;
select pg_temp.chk('authenticated on ' || t.name || ': ' || t.want,
  (select string_agg(x, ',' order by n) from unnest(array['select', 'insert', 'update', 'delete', 'truncate']) with ordinality u(x, n)
    where has_table_privilege('authenticated', 'public.' || t.name, x)) = t.want,
  (select string_agg(x, ',' order by n) from unnest(array['select', 'insert', 'update', 'delete', 'truncate']) with ordinality u(x, n)
    where has_table_privilege('authenticated', 'public.' || t.name, x)))
  from (values ('book_parts', 'select,update'), ('book_part_versions', 'select,insert'),
               ('book_part_drafts', 'select,insert,update,delete'), ('book_also_by', 'select,insert,delete'),
               ('part_suggestions', 'select,update')) t(name, want);
select pg_temp.chk('C2: book_parts has select and update policies only',
  (select array_agg(cmd::text order by cmd) from pg_policies where tablename = 'book_parts') = array['SELECT', 'UPDATE']);

create temp table new_fns (sig text, trigger boolean);
insert into new_fns values
  ('public.book_parts_guard()', true), ('public.book_part_versions_guard()', true), ('public.book_part_drafts_guard()', true),
  ('public.book_also_by_guard()', true), ('public.part_suggestions_guard()', true), ('public.books_create_parts()', true),
  ('public.books_pen_about_draft()', true),
  ('public.part_kind_ord(text)', false), ('public.part_lock(uuid)', false), ('public.part_next_version(uuid,text)', false),
  ('public.save_part_version(uuid,text,uuid,boolean)', false), ('public.restore_part_version(uuid,uuid,uuid)', false),
  ('public.copy_bio_to_about(uuid,uuid)', false), ('public.apply_part_suggestion(uuid,uuid,text)', false),
  ('public.also_by_entries(uuid)', false), ('public.book_parts_json(uuid)', false), ('public.set_also_by(uuid,jsonb)', false),
  ('public.part_file_list(uuid)', false), ('public.part_key_extra(uuid)', false), ('public.about_text(uuid)', false),
  ('public.export_part_list(uuid,boolean)', false), ('public.book_parts_files(uuid)', false);
select pg_temp.chk('anon cannot run any new function', not exists (select 1 from new_fns where has_function_privilege('anon', sig, 'execute')),
  (select string_agg(sig, ', ') from new_fns where has_function_privilege('anon', sig, 'execute')));
select pg_temp.chk('authenticated runs every new function except the trigger functions',
  not exists (select 1 from new_fns where has_function_privilege('authenticated', sig, 'execute') = trigger),
  (select string_agg(sig, ', ') from new_fns where has_function_privilege('authenticated', sig, 'execute') = trigger));
select pg_temp.chk('every new function pins search_path; only books_create_parts is SECURITY DEFINER',
  (select bool_and(p.proconfig = array['search_path=""'] and p.prosecdef = (f.sig = 'public.books_create_parts()'))
     from new_fns f join pg_proc p on p.oid = f.sig::regprocedure));
select pg_temp.chk('no new function takes a limit or budget input', not exists (
  select 1 from new_fns f join pg_proc p on p.oid = f.sig::regprocedure, unnest(p.proargnames) a
   where a ~* 'limit|budget|max|cap'));

-- ── book_parts: what a user can change ──
:ASA
select pg_temp.expect('A turns a part on', format($q$update public.book_parts set enabled = true where id = %L$q$, pg_temp.part(:BOOK1, 'dedication')), 'OK 1');
select pg_temp.expect('A marks a text part Final', format($q$update public.book_parts set status = 'final' where id = %L$q$, pg_temp.part(:BOOK1, 'dedication')), 'OK 1');
select pg_temp.expect('a status on the review request page is refused', format($q$update public.book_parts set status = 'final' where id = %L$q$, pg_temp.part(:BOOK1, 'review_request')), '23514%');
select pg_temp.expect('an unknown status is refused', format($q$update public.book_parts set status = 'reviewed' where id = %L$q$, pg_temp.part(:BOOK1, 'dedication')), '23514%');
select pg_temp.expect('A cannot insert a part (C2)', format($q$insert into public.book_parts (book_id, kind, status) values (%L, 'preface', 'draft')$q$, :BOOK1), '42501%');
select pg_temp.expect('A cannot delete a part', format($q$delete from public.book_parts where book_id = %L$q$, :BOOK1), '42501%');
select pg_temp.expect('the guard refuses a change of ' || c.col, format('update public.book_parts set %I = %s where id = %L', c.col, c.val, pg_temp.part(:BOOK1, 'preface')), '%part_fixed%')
  from (values ('kind', '''foreword'''), ('book_id', '''b0000000-0000-4000-8000-000000000002'''), ('id', 'gen_random_uuid()'),
               ('user_id', '''00000000-0000-4000-8000-00000000000b'''), ('created_at', '''2020-01-01'''), ('updated_at', '''2020-01-01''')) c(col, val);
:OWNER
select pg_temp.expect('even the owner of the database cannot make a part for another user''s book',
  format($q$insert into public.book_parts (user_id, book_id, kind, status) values (%L, %L, 'preface', 'draft')$q$, :B, :BOOK1), '%part_owner%');

-- ── Versions ──
:ASA
select pg_temp.expect('a blank first version is refused', format($q$select public.save_part_version(%L, E' \n ', null)$q$, pg_temp.part(:BOOK1, 'dedication')), '%empty_first_version%');
select pg_temp.chk('A saves v1', (pg_temp.save(:BOOK1, 'dedication', 'For Sam and Max.') ->> 'version_no') = '1');
select pg_temp.chk('v1 is current, manual, 4 words, the status stays Final',
  (select v.source = 'manual' and v.word_count = 4 and p.status = 'final'
     from public.book_parts p join public.book_part_versions v on v.id = p.current_version_id where p.id = pg_temp.part(:BOOK1, 'dedication')));
select pg_temp.chk('the same text again makes no version', (pg_temp.save(:BOOK1, 'dedication', 'For Sam and Max.') ->> 'created') = 'false');
select pg_temp.expect('a stale base is refused', format($q$select public.save_part_version(%L, 'x', null)$q$, pg_temp.part(:BOOK1, 'dedication')), '%version_conflict%');
select pg_temp.chk('make_current false keeps the current version',
  (with c as (select pg_temp.cur(:BOOK1, 'dedication') as id)
   select (public.save_part_version(pg_temp.part(:BOOK1, 'dedication'), 'Kept aside.', c.id, false) ->> 'version_no') = '2' from c));
select pg_temp.chk('current is still v1', (select version_no from public.book_part_versions where id = pg_temp.cur(:BOOK1, 'dedication')) = 1);
select pg_temp.chk('A saves v3', (pg_temp.save(:BOOK1, 'dedication', 'For Max.') ->> 'version_no') = '3');
select pg_temp.expect('a direct version insert is refused', format($q$insert into public.book_part_versions (part_id, version_no, content, source) values (%L, 9, 'x', 'manual')$q$, pg_temp.part(:BOOK1, 'dedication')), '%part_versions_rpc_only%');
select pg_temp.expect('versions cannot be updated', $q$update public.book_part_versions set content = 'x'$q$, '42501%');
select pg_temp.expect('versions cannot be deleted', $q$delete from public.book_part_versions$q$, '42501%');
select pg_temp.expect('the current pointer cannot be set by hand', format($q$update public.book_parts set current_version_id = (select id from public.book_part_versions where version_no = 1 and part_id = %L) where id = %L$q$, pg_temp.part(:BOOK1, 'dedication'), pg_temp.part(:BOOK1, 'dedication')), '%part_versions_rpc_only%');
select pg_temp.expect('nor cleared by hand', format($q$update public.book_parts set current_version_id = null where id = %L$q$, pg_temp.part(:BOOK1, 'dedication')), '%part_versions_rpc_only%');
select pg_temp.expect('nor set to a version of another part', format($q$update public.book_parts set current_version_id = %L where id = %L$q$, pg_temp.cur(:BOOK1, 'dedication'), pg_temp.part(:BOOK1, 'preface')), '%version_other_part%');
select pg_temp.expect('epigraph: 1,001 characters refused', format($q$select public.save_part_version(%L, repeat('a', 1001), null)$q$, pg_temp.part(:BOOK1, 'epigraph')), '%part_too_long%');
select pg_temp.expect('epigraph: 1,000 characters saved', format($q$select public.save_part_version(%L, repeat('a', 1000), null)$q$, pg_temp.part(:BOOK1, 'epigraph')), 'OK 1');
select pg_temp.expect('preface: 20,001 characters refused', format($q$select public.save_part_version(%L, repeat('a', 20001), null)$q$, pg_temp.part(:BOOK1, 'preface')), '%part_too_long%');
select pg_temp.expect('preface: 20,000 characters saved', format($q$select public.save_part_version(%L, repeat('a', 20000), null)$q$, pg_temp.part(:BOOK1, 'preface')), 'OK 1');
select pg_temp.expect(k || ' has no text to save', format($q$select public.save_part_version(%L, 'x', null)$q$, pg_temp.part(:BOOK1, k)), '%part_no_text%')
  from unnest(array['review_request', 'also_by']) k;

-- Restore.
select pg_temp.chk('restore v1 makes v4, labelled',
  (select public.restore_part_version(pg_temp.part(:BOOK1, 'dedication'),
            (select id from public.book_part_versions where part_id = pg_temp.part(:BOOK1, 'dedication') and version_no = 1),
            pg_temp.cur(:BOOK1, 'dedication')) ->> 'version_no') = '4');
select pg_temp.chk('v4: source restore, "Restored from v1", the v1 text',
  (select source = 'restore' and label = 'Restored from v1' and content = 'For Sam and Max.' from public.book_part_versions where id = pg_temp.cur(:BOOK1, 'dedication')));
select pg_temp.expect('a version of another part is not found', format($q$select public.restore_part_version(%L, %L, %L)$q$, pg_temp.part(:BOOK1, 'dedication'), pg_temp.cur(:BOOK1, 'preface'), pg_temp.cur(:BOOK1, 'dedication')), '%version_not_found%');

-- Drafts.
select pg_temp.expect('A saves a draft', format($q$insert into public.book_part_drafts (part_id, content, base_version_id) values (%L, 'Typed text', %L)$q$, pg_temp.part(:BOOK1, 'dedication'), pg_temp.cur(:BOOK1, 'dedication')), 'OK 1');
select pg_temp.chk('book_parts_json reports the unsaved draft',
  (select e ->> 'has_draft' from jsonb_array_elements(public.book_parts_json(:BOOK1) -> 'parts') e where e ->> 'kind' = 'dedication') = 'true');
select pg_temp.expect('restore waits for the typed text', format($q$select public.restore_part_version(%L, %L, %L)$q$, pg_temp.part(:BOOK1, 'dedication'), pg_temp.cur(:BOOK1, 'dedication'), pg_temp.cur(:BOOK1, 'dedication')), '%unsaved_draft%');
select pg_temp.chk('A saves the typed text', (pg_temp.save(:BOOK1, 'dedication', 'Typed text') ->> 'created') = 'true');
select pg_temp.chk('saving removes the draft', not exists (select 1 from public.book_part_drafts));
select pg_temp.expect('a draft on a base of another part is refused', format($q$insert into public.book_part_drafts (part_id, content, base_version_id) values (%L, 'x', %L)$q$, pg_temp.part(:BOOK1, 'foreword'), pg_temp.cur(:BOOK1, 'dedication')), '%version_other_part%');
select pg_temp.expect('no draft on a part with no text', format($q$insert into public.book_part_drafts (part_id, content) values (%L, 'x')$q$, pg_temp.part(:BOOK1, 'also_by')), '%part_no_text%');
select pg_temp.expect('epigraph draft: 1,001 characters refused', format($q$insert into public.book_part_drafts (part_id, content) values (%L, repeat('a', 1001))$q$, pg_temp.part(:BOOK1, 'epigraph')), '%part_too_long%');
select pg_temp.expect('epigraph draft: 1,000 characters kept', format($q$insert into public.book_part_drafts (part_id, content) values (%L, repeat('a', 1000))$q$, pg_temp.part(:BOOK1, 'epigraph')), 'OK 1');
select pg_temp.expect('epigraph draft: an update to 1,001 refused', format($q$update public.book_part_drafts set content = repeat('a', 1001) where part_id = %L$q$, pg_temp.part(:BOOK1, 'epigraph')), '%part_too_long%');
select pg_temp.expect('another part''s draft may be longer than 1,000', format($q$insert into public.book_part_drafts (part_id, content) values (%L, repeat('a', 1500))$q$, pg_temp.part(:BOOK1, 'preface')), 'OK 1');
delete from public.book_part_drafts;

-- ── copy_bio_to_about ──
select pg_temp.chk('first copy makes v1', (public.copy_bio_to_about(:BOOK1, null) ->> 'version_no') = '1');
select pg_temp.chk('first copy makes the bio_copy version',
  (select source = 'bio_copy' and content = 'Nora teaches chair yoga.' from public.book_part_versions where id = pg_temp.cur(:BOOK1, 'about_author')));
select pg_temp.chk('copying the same bio again makes no version', (public.copy_bio_to_about(:BOOK1, pg_temp.cur(:BOOK1, 'about_author')) ->> 'created') = 'false');
insert into public.book_part_drafts (part_id, content, base_version_id) values (pg_temp.part(:BOOK1, 'about_author'), 'My own words.', pg_temp.cur(:BOOK1, 'about_author'));
select pg_temp.chk('typed text, bio already current: no new bio version',
  (public.copy_bio_to_about(:BOOK1, pg_temp.cur(:BOOK1, 'about_author')) ->> 'created') = 'false');
select pg_temp.chk('with typed text: it becomes a manual version first, the bio is current',
  (select source = 'manual' and content = 'My own words.' from public.book_part_versions where part_id = pg_temp.part(:BOOK1, 'about_author') and version_no = 2)
  and (select content from public.book_part_versions where id = pg_temp.cur(:BOOK1, 'about_author')) = 'Nora teaches chair yoga.'
  and not exists (select 1 from public.book_part_drafts));
select pg_temp.chk('A types over it', (pg_temp.save(:BOOK1, 'about_author', 'Edited about.') ->> 'created') = 'true');
insert into public.book_part_drafts (part_id, content, base_version_id) values (pg_temp.part(:BOOK1, 'about_author'), 'Half typed.', pg_temp.cur(:BOOK1, 'about_author'));
select pg_temp.chk('copy over an edit makes v5',
  (public.copy_bio_to_about(:BOOK1, pg_temp.cur(:BOOK1, 'about_author')) ->> 'version_no') = '5');
select pg_temp.chk('copy: typed text saved as manual, then a new bio_copy',
  (select source = 'bio_copy' and content = 'Nora teaches chair yoga.' from public.book_part_versions where id = pg_temp.cur(:BOOK1, 'about_author'))
  and (select source = 'manual' and content = 'Half typed.' from public.book_part_versions where part_id = pg_temp.part(:BOOK1, 'about_author') and version_no = 4));
select pg_temp.expect('a stale base is refused', format($q$select public.copy_bio_to_about(%L, null)$q$, :BOOK1), '%version_conflict%');
select pg_temp.expect('a pen name with no bio', format($q$select public.copy_bio_to_about(%L, null)$q$, :BOOK4), '%bio_empty%');

-- ── User B and anon ──
:ASB
select pg_temp.chk('B reads none of A''s rows in ' || t,
  (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I where user_id = %L', t, :A), false, true, '')))[1]::text = '0')
  from unnest(array['book_parts', 'book_part_versions', 'book_part_drafts', 'book_also_by', 'part_suggestions']) t;
select pg_temp.expect('B updates 0 of A''s parts', format($q$update public.book_parts set enabled = true where book_id = %L$q$, :BOOK1), 'OK 0');
:OWNER
select id as a_part from public.book_parts where book_id = :BOOK1 and kind = 'dedication' \gset
select current_version_id as a_ver from public.book_parts where book_id = :BOOK1 and kind = 'dedication' \gset
:ASB
select pg_temp.expect('B cannot save A''s part', format($q$select public.save_part_version(%L, 'x', %L)$q$, :'a_part', :'a_ver'), '%part_not_found%');
select pg_temp.expect('B cannot restore A''s part', format($q$select public.restore_part_version(%L, %L, %L)$q$, :'a_part', :'a_ver', :'a_ver'), '%part_not_found%');
select pg_temp.expect('B cannot copy a bio into A''s book', format($q$select public.copy_bio_to_about(%L, null)$q$, :BOOK1), '%part_not_found%');
select pg_temp.expect('B cannot set A''s Also by', format($q$select public.set_also_by(%L, '[]')$q$, :BOOK1), '%book_not_found%');
select pg_temp.expect('B cannot draft on A''s part', format($q$insert into public.book_part_drafts (part_id, content) values (%L, 'x')$q$, :'a_part'), '42501%');
select pg_temp.expect('B cannot insert a version on A''s part', format($q$insert into public.book_part_versions (part_id, version_no, content, source) values (%L, 99, 'x', 'manual')$q$, :'a_part'), '42501%');
select pg_temp.chk('B gets null for A''s book', public.book_parts_json(:BOOK1) is null);
select pg_temp.chk('B gets nothing from A''s lists', pg_temp.files(:BOOK1) = '' and public.book_parts_files(:BOOK1) = '[]'::jsonb
  and public.about_text(:BOOK1) is null and not exists (select 1 from public.also_by_entries(:BOOK1)));
:ANON
select pg_temp.expect('anon cannot read ' || t, 'select * from public.' || t, '42501%')
  from unnest(array['book_parts', 'book_part_versions', 'book_part_drafts', 'book_also_by', 'part_suggestions']) t;
select pg_temp.expect('anon cannot run book_parts_json', format($q$select public.book_parts_json(%L)$q$, :BOOK1), '42501%');
select pg_temp.expect('anon cannot run set_also_by', format($q$select public.set_also_by(%L, '[]')$q$, :BOOK1), '42501%');

-- ── The service role bypasses RLS: the guards still check ──
:SERVICE
select pg_temp.expect('service: a version with another user is refused', format($q$insert into public.book_part_versions (user_id, part_id, version_no, content, source) values (%L, %L, 99, 'x', 'manual')$q$, :B, :'a_part'), '%version_owner%');
select pg_temp.expect('service: no text version for the review request page', format($q$insert into public.book_part_versions (user_id, part_id, version_no, content, source) select user_id, id, 1, 'x', 'manual' from public.book_parts where book_id = %L and kind = 'review_request'$q$, :BOOK1), '%part_no_text%');
select pg_temp.expect('service: a draft with another user is refused', format($q$insert into public.book_part_drafts (part_id, user_id, content) values (%L, %L, 'x')$q$, :'a_part', :B), '%draft_owner%');
select pg_temp.expect('service: an Also by row with another user is refused', format($q$insert into public.book_also_by (book_id, user_id, position, title) values (%L, %L, 1, 'x')$q$, :BOOK1, :B), '%also_by_owner%');
select pg_temp.expect('service: another user''s book cannot be listed', format($q$insert into public.book_also_by (book_id, user_id, position, other_book_id) values (%L, %L, 1, %L)$q$, :BOOK1, :A, :BOOKB), '%also_by_not_allowed%');
select pg_temp.expect('service: a book cannot list itself', format($q$insert into public.book_also_by (book_id, user_id, position, other_book_id) values (%L, %L, 1, %L)$q$, :BOOK1, :A, :BOOK1), '%also_by_not_allowed%');

-- ── set_also_by ──
:ASA
select pg_temp.chk('ticked and typed entries, in order', pg_temp.entries(:BOOK1, format('[{"book_id": "%s"}, {"title": "  My <Old> Book # & \"more\" $ @ * _  ", "subtitle": "  "}, {"book_id": "%s"}]', :BOOK3, :BOOK2)::jsonb) = 'OK 1');
select pg_temp.chk('positions 1 to 3; the typed title is trimmed and stored as typed; blank subtitle is null',
  (select count(*) = 3 and bool_and(valid) from public.also_by_entries(:BOOK1))
  and (select title = 'My <Old> Book # & "more" $ @ * _' and subtitle is null and other_book_id is null from public.also_by_entries(:BOOK1) where list_position = 2)
  and (select title = 'Third Book' from public.also_by_entries(:BOOK1) where list_position = 1));
select pg_temp.chk('C3: the candidates are the same pen name books that are not ticked',
  public.book_parts_json(:BOOK1) -> 'candidates' = '[]'::jsonb and public.book_parts_json(:BOOK2) -> 'candidates' @> format('[{"id": "%s"}]', :BOOK1)::jsonb
  and jsonb_array_length(public.book_parts_json(:BOOK2) -> 'candidates') = 2);
select pg_temp.chk('refused: ' || c.name, pg_temp.entries(:BOOK1, c.j::jsonb) like c.want, pg_temp.entries(:BOOK1, c.j::jsonb))
  from (values
    ('21 entries', (select jsonb_agg(jsonb_build_object('title', 't' || i))::text from generate_series(1, 21) i), '22023 also_by_bad%'),
    ('a title of 201', jsonb_build_array(jsonb_build_object('title', repeat('a', 201)))::text, '22023 also_by_bad%'),
    ('an empty title', '[{"title": "   "}]', '22023 also_by_bad%'),
    ('a subtitle of 201', jsonb_build_array(jsonb_build_object('title', 'x', 'subtitle', repeat('a', 201)))::text, '22023 also_by_bad%'),
    ('a book and a title', format('[{"book_id": "%s", "title": "x"}]', :BOOK2), '22023 also_by_bad%'),
    ('a bad id', '[{"book_id": "nope"}]', '22023 also_by_bad%'),
    ('an unknown key', '[{"title": "x", "url": "y"}]', '22023 also_by_bad%'),
    ('a title that is a number', '[{"title": 5}]', '22023 also_by_bad%'),
    ('an entry that is not an object', '["x"]', '22023 also_by_bad%'),
    ('not an array', '{"title": "x"}', '22023 also_by_bad%'),
    ('the same book twice', format('[{"book_id": "%s"}, {"book_id": "%s"}]', :BOOK2, :BOOK2), '22023 also_by_bad%'),
    ('another pen name', format('[{"book_id": "%s"}]', :BOOK4), '%also_by_not_allowed%'),
    ('the book itself', format('[{"book_id": "%s"}]', :BOOK1), '%also_by_not_allowed%'),
    ('another user''s book', format('[{"book_id": "%s"}]', :BOOKB), '%also_by_not_allowed%')) c(name, j, want);
select pg_temp.chk('a refused list changes nothing', (select count(*) from public.book_also_by where book_id = :BOOK1) = 3);
select pg_temp.chk('20 entries, title 200, subtitle 200 are saved', pg_temp.entries(:BOOK2,
  (select jsonb_agg(jsonb_build_object('title', repeat('t', 200), 'subtitle', repeat('s', 200))) from generate_series(1, 20))) = 'OK 1');
select pg_temp.chk('there are 20 rows', (select count(*) from public.book_also_by where book_id = :BOOK2) = 20);
select pg_temp.chk('an empty list is accepted', pg_temp.entries(:BOOK2, '[]') = 'OK 1');
select pg_temp.chk('it clears the list', not exists (select 1 from public.book_also_by where book_id = :BOOK2));
select pg_temp.expect('a direct Also by insert is refused', format($q$insert into public.book_also_by (book_id, position, title) values (%L, 9, 'x')$q$, :BOOK1), '%also_by_rpc_only%');
select pg_temp.expect('a direct Also by delete is refused', format($q$delete from public.book_also_by where book_id = %L$q$, :BOOK1), '%also_by_rpc_only%');
select pg_temp.expect('a direct Also by update is refused', $q$update public.book_also_by set position = 9$q$, '42501%');

-- ── part_file_list ──
delete from public.book_part_drafts;
update public.book_parts set enabled = false, status = case when status is not null then 'draft' end where book_id = :BOOK1;
select pg_temp.chk('nothing on: nothing in the file', pg_temp.files(:BOOK1) = '' and not (public.part_key_extra(:BOOK1) ? 'book_parts'));
select public.format_key(:BOOK1) as k0, public.epub_key(:BOOK1) as e0 \gset
update public.book_parts set enabled = true where book_id = :BOOK1 and kind in ('dedication', 'epigraph', 'foreword', 'also_by', 'review_request', 'about_author');
select pg_temp.chk('Draft text parts stay out; review request and Also by with entries are in', pg_temp.files(:BOOK1) = 'review_request,also_by', pg_temp.files(:BOOK1));
update public.book_parts set status = 'final' where book_id = :BOOK1 and kind in ('dedication', 'epigraph', 'foreword', 'about_author');
select pg_temp.chk('Final with text is in, in the fixed order; Final with no text is out',
  pg_temp.files(:BOOK1) = 'dedication,epigraph,about_author,review_request,also_by', pg_temp.files(:BOOK1));
select pg_temp.chk('A blanks the epigraph', (pg_temp.save(:BOOK1, 'epigraph', '   ') ->> 'created') = 'true');
select pg_temp.chk('a Final part with blank text is out', pg_temp.files(:BOOK1) = 'dedication,about_author,review_request,also_by');
select pg_temp.chk('version_id is the current version; null for review request and Also by',
  (select bool_and(case when kind in ('review_request', 'also_by') then version_id is null else version_id = pg_temp.cur(:BOOK1, kind) end)
     from public.part_file_list(:BOOK1)));
select pg_temp.chk('book_parts_files: the Final text, Also by entries with titles',
  (select j -> 0 ->> 'content' = 'Typed text' and j -> 3 -> 'entries' -> 0 ->> 'title' = 'Third Book' and j -> 3 -> 'entries' -> 1 -> 'subtitle' = 'null'::jsonb
     from (select public.book_parts_files(:BOOK1) j) s));
select pg_temp.chk('format_json and export_json carry the same book_parts',
  public.format_json(:BOOK1) -> 'book_parts' = public.book_parts_files(:BOOK1) and public.export_json(:BOOK1) -> 'book_parts' = public.book_parts_files(:BOOK1));
select pg_temp.chk('qc_json carries the 8 part states and the nested data text',
  (select jsonb_array_length(j -> 'book_parts') = 8 and j -> 'data' -> 'book_parts' = public.book_parts_files(:BOOK1) from (select public.qc_json(:BOOK1) j) s));
select pg_temp.chk('format_json keeps also_by_valid for the live 08', public.format_json(:BOOK1) ? 'also_by_valid');
select pg_temp.chk('part_key_extra: only the new parts that are on, version only when in the file',
  public.part_key_extra(:BOOK1) = jsonb_build_object('book_parts', jsonb_build_array(
    jsonb_build_array('dedication', true, pg_temp.cur(:BOOK1, 'dedication')),
    jsonb_build_array('epigraph', true, null),
    jsonb_build_array('foreword', true, null),
    jsonb_build_array('review_request', true, null))), public.part_key_extra(:BOOK1)::text);

-- Each change of what is in the file changes both keys.
select public.format_key(:BOOK1) as k1, public.epub_key(:BOOK1) as e1 \gset
select pg_temp.chk('parts on change both keys', :'k1' <> :'k0' and :'e1' <> :'e0');
select pg_temp.chk('A edits the dedication', (pg_temp.save(:BOOK1, 'dedication', 'New dedication.') ->> 'created') = 'true');
select pg_temp.chk('a new dedication text changes both keys', public.format_key(:BOOK1) <> :'k1' and public.epub_key(:BOOK1) <> :'e1');
select public.format_key(:BOOK1) as k2 \gset
update public.book_parts set status = 'draft' where book_id = :BOOK1 and kind = 'dedication';
select pg_temp.chk('Final to Draft changes the key', public.format_key(:BOOK1) <> :'k2');
select public.format_key(:BOOK1) as k3 \gset
select pg_temp.chk('A edits About', (pg_temp.save(:BOOK1, 'about_author', 'Another about.') ->> 'created') = 'true');
select pg_temp.chk('a new About text changes the key', public.format_key(:BOOK1) <> :'k3');
select public.format_key(:BOOK1) as k4 \gset
update public.pen_names set bio_text = 'Changed bio.' where id = :P1;
select pg_temp.chk('a pen name bio edit no longer changes the key', public.format_key(:BOOK1) = :'k4');
update public.books set subtitle = 'A new subtitle' where id = :BOOK3;
select pg_temp.chk('a ticked book''s subtitle is not in the key', public.format_key(:BOOK1) = :'k4');
update public.books set title = 'Third Book, renamed' where id = :BOOK3;
select pg_temp.chk('its title is', public.format_key(:BOOK1) <> :'k4');
update public.book_parts set enabled = false where book_id = :BOOK1;
select pg_temp.chk('all off again: the keys of a book with no parts', public.format_key(:BOOK1) = :'k0' and public.epub_key(:BOOK1) = :'e0');

-- ── The 07 key ──
delete from public.book_part_drafts;
update public.book_parts set status = 'draft' where book_id = :BOOK1 and status is not null;
select public.qc_inputs_key(:BOOK1) as q0 \gset
select pg_temp.expect('07: a run saved with no part on', format($q$insert into public.qc_runs (book_id, versions, inputs_key, results, sections, words, style) values (%L, public.qc_versions(%L), %L, '{"items": [], "more": {}, "sources": [], "notes": {"unsaved": 0, "running": 0}}', 1, 1, 'classic')$q$, :BOOK1, :BOOK1, :'q0'), 'OK 1');
select pg_temp.chk('07: it is current', (select current from public.qc_mark(:BOOK1)));
select pg_temp.chk('07: A edits a part that is off', (pg_temp.save(:BOOK1, 'foreword', 'Off and edited.') ->> 'created') = 'true');
update public.book_parts set status = 'final' where book_id = :BOOK1 and kind = 'foreword';
select pg_temp.chk('07 key unchanged with no part on (edit and Final of an off part)', public.qc_inputs_key(:BOOK1) = :'q0');
update public.book_parts set status = 'draft' where book_id = :BOOK1 and kind = 'foreword';
update public.book_parts set enabled = true where book_id = :BOOK1 and kind = 'foreword';
select public.qc_inputs_key(:BOOK1) as q1 \gset
select pg_temp.chk('07 key changes after enabling', :'q1' <> :'q0');
select pg_temp.chk('07: the saved run is no longer current', not (select current from public.qc_mark(:BOOK1)));
update public.book_parts set status = 'final' where book_id = :BOOK1 and kind = 'foreword';
select public.qc_inputs_key(:BOOK1) as q2 \gset
select pg_temp.chk('07 key changes after Final', :'q2' <> :'q1' and :'q2' <> :'q0');
select pg_temp.chk('07: A saves a new version', (pg_temp.save(:BOOK1, 'foreword', 'A new foreword.') ->> 'created') = 'true');
select pg_temp.chk('07 key changes after a new version', public.qc_inputs_key(:BOOK1) <> :'q2');
select pg_temp.chk('07: qc_json carries today''s key', public.qc_json(:BOOK1) ->> 'inputs_key' = public.qc_inputs_key(:BOOK1));
update public.book_parts set enabled = false where book_id = :BOOK1 and kind = 'foreword';
select pg_temp.chk('07: off again, the first key and the run is current',
  public.qc_inputs_key(:BOOK1) = :'q0' and (select current from public.qc_mark(:BOOK1)));
update public.book_parts set enabled = true where book_id = :BOOK1 and kind = 'about_author';
select pg_temp.chk('07 key changes with about_author on', public.qc_inputs_key(:BOOK1) <> :'q0');
update public.book_parts set enabled = false where book_id = :BOOK1 and kind = 'about_author';
update public.book_parts set enabled = true where book_id = :BOOK1 and kind = 'also_by';
select pg_temp.chk('07 key changes with also_by on', public.qc_inputs_key(:BOOK1) <> :'q0');
update public.book_parts set enabled = false where book_id = :BOOK1 and kind = 'also_by';
update public.book_parts set enabled = true where book_id = :BOOK1 and kind = 'review_request';
select pg_temp.chk('07 key changes with review_request on', public.qc_inputs_key(:BOOK1) <> :'q0');
update public.book_parts set enabled = false where book_id = :BOOK1 and kind = 'review_request';

-- ── Q-11 and stale ticks ──
update public.book_parts set status = 'final' where book_id = :BOOK1 and kind in ('about_author', 'dedication');
update public.books set pen_name_id = :P1 where id = :BOOK1;
select pg_temp.chk('the same pen name again: About stays Final', (select status from public.book_parts where id = pg_temp.part(:BOOK1, 'about_author')) = 'final');
update public.books set pen_name_id = :P2 where id = :BOOK1;
select pg_temp.chk('Q-11: a new pen name moves About to Draft, the text stays',
  (select status = 'draft' and current_version_id is not null from public.book_parts where id = pg_temp.part(:BOOK1, 'about_author')));
select pg_temp.chk('the other parts keep their status', (select status from public.book_parts where id = pg_temp.part(:BOOK1, 'dedication')) = 'final');
select pg_temp.chk('the ticks are not valid for the new pen name; the typed title is',
  (select array_agg(valid order by list_position) from public.also_by_entries(:BOOK1)) = array[false, true, false]);
select pg_temp.chk('an old tick may stay in a saved list', pg_temp.entries(:BOOK1, format('[{"book_id": "%s"}, {"title": "Typed"}]', :BOOK3)::jsonb) = 'OK 1');
select pg_temp.chk('the old tick is removed', pg_temp.entries(:BOOK1, '[{"title": "Typed"}]') = 'OK 1');
select pg_temp.chk('but cannot be ticked again once removed', pg_temp.entries(:BOOK1, format('[{"book_id": "%s"}]', :BOOK3)::jsonb) like '%also_by_not_allowed%');
update public.books set pen_name_id = null where id = :BOOK1;
update public.books set pen_name_id = :P1 where id = :BOOK1;
:OWNER
update public.book_parts set status = 'final' where book_id = :BOOK1 and kind = 'about_author';
:SERVICE
update public.books set pen_name_id = :P2 where id = :BOOK1;
:OWNER
select pg_temp.chk('Q-11 also for the service role', (select status from public.book_parts where book_id = :BOOK1 and kind = 'about_author') = 'draft');
update public.books set pen_name_id = :P1 where id = :BOOK1;

-- Touch: a part change and an Also by change move the book up.
create temp table t0 as select updated_at from public.books where id = :BOOK2;
grant select on t0 to public;
:ASA
update public.book_parts set enabled = true where book_id = :BOOK2 and kind = 'preface';
select pg_temp.chk('a part change touches its book', (select updated_at from public.books where id = :BOOK2) > (select updated_at from t0));

-- ── Suggestions ──
select pg_temp.chk('A writes the foreword', (pg_temp.save(:BOOK1, 'foreword', 'One two three. Four five.') ->> 'created') = 'true');
:OWNER
select id as fw, current_version_id as fwv from public.book_parts where book_id = :BOOK1 and kind = 'foreword' \gset
:SERVICE
insert into public.part_suggestions (id, user_id, book_id, part_id, action, base_version_id, selection, output) values
  ('99000000-0000-4000-8000-000000000001', :A, :BOOK1, :'fw', 'improve', :'fwv', 'Four five.', 'Four and five.'),
  ('99000000-0000-4000-8000-000000000002', :A, :BOOK1, :'fw', 'shorten', :'fwv', 'One two three.', 'One.');
select pg_temp.expect('no suggestion for the ' || k, format($q$insert into public.part_suggestions (user_id, book_id, part_id, action, selection, output) select user_id, book_id, id, 'improve', 'a', 'b' from public.book_parts where book_id = %L and kind = %L$q$, :BOOK1, k), '%part_no_improve%')
  from unnest(array['epigraph', 'review_request', 'also_by']) k;
select pg_temp.expect('service: a suggestion for another user is refused', format($q$insert into public.part_suggestions (user_id, book_id, part_id, action, selection, output) values (%L, %L, %L, 'improve', 'a', 'b')$q$, :B, :BOOK1, :'fw'), '%suggestion_owner%');
:ASB
select pg_temp.expect('B cannot apply A''s suggestion', format($q$select public.apply_part_suggestion('99000000-0000-4000-8000-000000000001', %L, 'x')$q$, :'fwv'), '%suggestion_not_found%');
:ASA
select pg_temp.expect('A cannot insert a suggestion', format($q$insert into public.part_suggestions (user_id, book_id, part_id, action, selection, output) values (%L, %L, %L, 'improve', 'a', 'b')$q$, :A, :BOOK1, :'fw'), '42501%');
select pg_temp.expect('A cannot mark one used by hand', $q$update public.part_suggestions set used_at = now()$q$, '%suggestions_server_only%');
select pg_temp.expect('a text that changes more than the passage is refused', format($q$select public.apply_part_suggestion('99000000-0000-4000-8000-000000000001', %L, 'Zero two three. Four and five.')$q$, :'fwv'), '%suggestion_mismatch%');
insert into public.book_part_drafts (part_id, content, base_version_id) values (:'fw', 'Typing', :'fwv');
select pg_temp.expect('typed text blocks Accept', format($q$select public.apply_part_suggestion('99000000-0000-4000-8000-000000000001', %L, 'One two three. Four and five.')$q$, :'fwv'), '%unsaved_draft%');
delete from public.book_part_drafts;
select pg_temp.expect('A accepts', format($q$select public.apply_part_suggestion('99000000-0000-4000-8000-000000000001', %L, 'One two three. Four and five.')$q$, :'fwv'), 'OK 1');
select pg_temp.chk('the new version is current, source improve; the suggestion is used and linked',
  (select v.source = 'improve' and v.content = 'One two three. Four and five.' and s.version_id = v.id and s.used_at is not null
     from public.book_parts p join public.book_part_versions v on v.id = p.current_version_id
     join public.part_suggestions s on s.id = '99000000-0000-4000-8000-000000000001' where p.id = :'fw'));
select pg_temp.expect('only once', format($q$select public.apply_part_suggestion('99000000-0000-4000-8000-000000000001', %L, 'x')$q$, :'fwv'), '%suggestion_used%');
:OWNER
update public.part_suggestions set created_at = now() - interval '2 hours' where id = '99000000-0000-4000-8000-000000000002';
:ASA
select pg_temp.expect('an old suggestion is refused', format($q$select public.apply_part_suggestion('99000000-0000-4000-8000-000000000002', %L, 'x')$q$, pg_temp.cur(:BOOK1, 'foreword')), '%suggestion_expired%');
select pg_temp.expect('an improve version cannot be inserted by hand', format($q$insert into public.book_part_versions (part_id, version_no, content, source) values (%L, 50, 'x', 'improve')$q$, :'fw'), '%part_versions_rpc_only%');

-- ── 07 rule ids ──
select pg_temp.chk('part_empty and part_not_final are rule ids', public.qc_rule_ok('part_empty') and public.qc_rule_ok('part_not_final'));
select pg_temp.expect('but have no Mark as OK: ' || r, format($q$insert into public.qc_dismissed (book_id, rule, issue_key, label) values (%L, %L, 'k', 'l')$q$, :BOOK1, r), '23514%')
  from unnest(array['part_empty', 'part_not_final']) r;
select pg_temp.expect('another rule can still be marked as OK', format($q$insert into public.qc_dismissed (book_id, rule, issue_key, label) values (%L, 'emoji', 'k', 'l')$q$, :BOOK1), 'OK 1');

-- ── Exports and badges ──
update public.book_parts set enabled = false where book_id = :BOOK1;
update public.book_parts set enabled = true, status = 'final' where book_id = :BOOK1 and kind in ('dedication', 'about_author');
select pg_temp.expect('A records a PDF', format($q$insert into public.book_exports (book_id, format, include, parts, versions, page_count, settings_key, engine) values (%L, 'pdf', 'final', '{"title": true, "copyright": true, "contents": true, "intro": true, "conclusion": true, "about": false}', public.pdf_version_ids(%L), 40, public.format_key(%L), 'typst 0.14.2 · t1')$q$, :BOOK1, :BOOK1, :BOOK1), 'OK 1');
select pg_temp.chk('PDF: about from book_parts, the part list in the snapshot',
  (select parts -> 'about' = 'true'::jsonb and snapshot -> 'book_parts' = jsonb_build_array(
            jsonb_build_array('dedication', pg_temp.cur(:BOOK1, 'dedication')), jsonb_build_array('about_author', pg_temp.cur(:BOOK1, 'about_author')))
          and snapshot ->> 'bio_md5' = md5(public.about_text(:BOOK1)) from public.book_exports where format = 'pdf'),
  (select snapshot::text from public.book_exports where format = 'pdf'));
select pg_temp.expect('A records a DOCX without About', format($q$insert into public.book_exports (book_id, format, include, parts, versions) values (%L, 'docx', 'final', '{"title": true, "copyright": true, "contents": true, "intro": true, "conclusion": true, "about": false}', public.pdf_version_ids(%L))$q$, :BOOK1, :BOOK1), 'OK 1');
select pg_temp.chk('DOCX without About: About is not in its list',
  (select snapshot -> 'book_parts' = jsonb_build_array(jsonb_build_array('dedication', pg_temp.cur(:BOOK1, 'dedication'))) from public.book_exports where format = 'docx'));
select pg_temp.chk('the DOCX is current', not (select changed from public.export_badges() where book_id = :BOOK1));
select pg_temp.chk('A edits About', (pg_temp.save(:BOOK1, 'about_author', 'About, again.') ->> 'created') = 'true');
select pg_temp.chk('an About edit does not change a DOCX without About', not (select changed from public.export_badges() where book_id = :BOOK1));
select pg_temp.chk('it changes the PDF', (select changed from public.pdf_marks(:BOOK1)));
update public.book_parts set enabled = true where book_id = :BOOK1 and kind = 'review_request';
select pg_temp.chk('a part turned on changes the DOCX', (select changed from public.export_badges() where book_id = :BOOK1));
update public.book_parts set enabled = false where book_id = :BOOK1;
select pg_temp.expect('a DOCX with no parts', format($q$insert into public.book_exports (book_id, format, include, parts, versions, created_at) values (%L, 'docx', 'final', '{"title": true, "copyright": true, "contents": true, "intro": true, "conclusion": true, "about": false}', public.pdf_version_ids(%L), clock_timestamp())$q$, :BOOK1, :BOOK1), 'OK 1');
select pg_temp.chk('has no book_parts key and is current',
  (select not (snapshot ? 'book_parts') from public.book_exports where format = 'docx' order by created_at desc limit 1)
  and not (select changed from public.export_badges() where book_id = :BOOK1));

-- ── Deletes ──
select pg_temp.chk('BOOK2 lists BOOK3', pg_temp.entries(:BOOK2, format('[{"book_id": "%s"}, {"title": "T"}]', :BOOK3)::jsonb) = 'OK 1');
select pg_temp.expect('A deletes a ticked book', format($q$delete from public.books where id = %L$q$, :BOOK3), 'OK 1');
select pg_temp.chk('its Also by row goes, the typed one stays', (select array_agg(title) from public.also_by_entries(:BOOK2)) = array['T']);
insert into public.book_part_drafts (part_id, content, base_version_id) values (:'fw', 'Left over', pg_temp.cur(:BOOK1, 'foreword'));
select pg_temp.expect('A deletes a book with parts, versions, a draft, Also by and suggestions', format($q$delete from public.books where id = %L$q$, :BOOK1), 'OK 1');
:OWNER
select pg_temp.chk('nothing of that book is left',
  not exists (select 1 from public.book_parts where book_id = :BOOK1) and not exists (select 1 from public.part_suggestions where book_id = :BOOK1)
  and not exists (select 1 from public.book_also_by where book_id = :BOOK1) and not exists (select 1 from public.book_part_drafts)
  and not exists (select 1 from public.book_part_versions v where not exists (select 1 from public.book_parts p where p.id = v.part_id)));
select pg_temp.expect('deleting a user takes every part row', format($q$delete from auth.users where id = %L$q$, :B), 'OK 1');
