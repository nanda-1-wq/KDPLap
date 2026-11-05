-- 0028_quality_control.sql
-- NicheInk · E14.1 · 07 Quality Control, Part 1 (data only).
-- Plan: docs/reviews/2026-11-05-e14-qc-plan.md, section 3 (owner answers, Nov 5).
-- The free checks run in the browser. Only book_checks holds an AI result, and
-- only the server writes it. Nothing here changes a book, a section, a version
-- or a status.
--
-- 1. export_json(book): one new key per section, word_target (the 80% rule).
--    Nothing else changes.
-- 2. The Out of date key. A run is current when both match today:
--      qc_versions(book)    the current version of every section with text
--                           (text_is_blank, 0019), every chapter kind, any
--                           status, in book order. Empty when none.
--      qc_inputs_key(book)  md5 of every input the free rules read besides
--                           the text. Null for a book the caller cannot see.
--    Not in the key on purpose: drafts, runs, kept findings, dismissals,
--    book_checks, ai_usage, exports, books.updated_at.
-- 3. qc_runs: one row per run, written by the browser. Row Level Security: a
--    user reads and adds only their own rows, on their own books. No update
--    and no delete (privileges revoked). A guard trigger, for every role:
--      a. user_id is the book's owner (P0001 "qc_owner"; a book the caller
--         cannot see is left to the insert policy, 42501);
--      b. the book row is locked, so two tabs cannot pass the cap together;
--      c. versions and inputs_key equal today's (P0001 "qc_stale");
--      d. the newest 5 runs per book stay.
--    A run never touches books.updated_at: a check is not an edit.
-- 4. qc_dismissed: Mark as OK, written by the browser. A user reads, adds and
--    removes only their own rows (Undo). No update. Unique per book, rule and
--    issue key; a repeat gives 23505, which the browser reads as done. A guard
--    trigger, for every role:
--      a. user_id is the book's owner (P0001 "qc_dismissed_owner");
--      b. section_id is null or a section of this book
--         (P0001 "qc_dismissed_section");
--      c. the book row is locked, at most 500 rows per book
--         (P0001 "qc_dismissed_limit").
-- 5. book_checks: the promise check, one row per chapter. A user only reads.
--    The service role upserts on chapter_id. A guard trigger, for every role:
--      a. user_id and book_id are the chapter's, and its kind is "chapter"
--         (P0001 "book_check_owner");
--      b. section_id is null or a section of this chapter
--         (P0001 "book_check_section");
--      c. every id in versions is a version of a section of this chapter, no
--         repeats (P0001 "book_check_version").
-- 6. qc_json(book): everything 07 reads, in one statement (one snapshot).
--    qc_mark(book): the run time and current flag, for the 07 mark. No text.
-- 7. Grants.
--
-- Checked before writing (repo and the local test cluster only, 2026-11-05; the
-- live database was not read): main at 8b39146, last migration 0027, 23 public
-- tables (rls_cross_user.sql), no qc_ or book_checks objects. export_json was
-- last defined in 0025. Baseline SQL suites: 1,427 pass, 0 fail. New tables and
-- a new read-only key in one function: no existing row can fail them.

-- ---------------------------------------------------------------------------
-- 1. export_json(book): word_target per section
-- ---------------------------------------------------------------------------
-- The 0025 function, with 'word_target' added. Everything else is unchanged.
-- The same return type, so the 0025 grants stay.
create or replace function public.export_json(p_book_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'book', jsonb_build_object(
      'id', b.id,
      'title', b.title,
      'subtitle', b.subtitle,
      'pen_name', p.name,
      'bio', p.bio_text,
      'trim', br.trim_size),
    'known', jsonb_build_object(
      'brief', jsonb_build_object(
        'topic_text', br.topic_text,
        'target_reader', br.target_reader,
        'reader_problem', br.reader_problem,
        'promise_draft', br.promise_draft,
        'options', coalesce(br.options, '{}'::jsonb)),
      'research', jsonb_build_object(
        'insights', (select jsonb_build_object('loves', i.loves, 'hates', i.hates, 'gaps', i.gaps)
                       from public.research_insights i where i.book_id = b.id),
        'competitors', coalesce((select jsonb_agg(jsonb_build_object('title', co.title) order by co.created_at, co.id)
                                   from public.competitors co where co.book_id = b.id), '[]'::jsonb),
        'sources', coalesce((select jsonb_agg(jsonb_build_object('kind', rs.kind, 'body', rs.body, 'citation', rs.citation) order by rs.created_at, rs.id)
                               from public.research_sources rs where rs.book_id = b.id), '[]'::jsonb))),
    'chapters', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id,
               'kind', c.kind,
               'position', c.position,
               'title', c.title,
               'objective', c.objective,
               'needs_review', c.needs_review,
               'sections', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', s.id,
                          'position', s.position,
                          'title', s.title,
                          'word_target', s.word_target,
                          'status', s.status,
                          'needs_review', s.needs_review,
                          'version', case when v.id is null then null else jsonb_build_object(
                                       'id', v.id,
                                       'version_no', v.version_no,
                                       'content', v.content,
                                       'partial', v.partial,
                                       'word_count', v.word_count) end,
                          'ai', case
                                  when exists (select 1 from public.section_versions h
                                                where h.section_id = s.id and h.source = 'generate') then 'draft'
                                  when exists (select 1 from public.section_versions h
                                                where h.section_id = s.id
                                                  and h.source in ('edit_format', 'improve', 'expand', 'shorten', 'humanize', 'custom')) then 'edits'
                                  else 'none' end,
                          'unsaved', coalesce(btrim(d.content) <> btrim(coalesce(v.content, '')), false),
                          'run', case when r.state = 'running' then jsonb_build_object(
                                   'started_at', r.started_at,
                                   'heartbeat_at', r.heartbeat_at) end)
                        order by s.position)
                   from public.sections s
                   left join public.section_versions v on v.id = s.current_version_id
                   left join public.section_drafts d on d.section_id = s.id
                   left join public.section_runs r on r.section_id = s.id
                  where s.chapter_id = c.id), '[]'::jsonb))
             order by c.position)
        from public.chapters c
       where c.book_id = b.id), '[]'::jsonb),
    'now', now())
  from public.books b
  left join public.pen_names p on p.id = b.pen_name_id
  left join public.book_briefs br on br.book_id = b.id
  where b.id = p_book_id
$$;

comment on function public.export_json(uuid) is
  'E11, E14: everything the Export dialog and 07 Quality Control read for one book, under the caller''s RLS (null when the book is not the caller''s). See 0025 for the shape; 0028 adds word_target per section.';

-- ---------------------------------------------------------------------------
-- 2. The Out of date key
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER: under the caller's RLS.
create or replace function public.qc_versions(p_book_id uuid)
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(v.id order by c.position, s.position), '{}'::uuid[])
    from public.chapters c
    join public.sections s on s.chapter_id = c.id
    join public.section_versions v on v.id = s.current_version_id
   where c.book_id = p_book_id
     and not public.text_is_blank(v.content)
$$;

comment on function public.qc_versions(uuid) is
  'E14: the current version id of every section with text, every chapter kind, any status, in book order. Empty when none. Under the caller''s RLS.';

-- Every input the free rules read besides the text. Left joins, so a one-row
-- table with no row reads the same as its empty row, and the 08 defaults stand
-- in before 08 is opened: making an empty row never puts a run out of date.
-- The lock time is an epoch number: a timestamptz in JSON prints in the
-- session's time zone, and this key must be the same in every session.
-- The Brief options are the three knownOf reads (js/text-checks.js).
create or replace function public.qc_inputs_key(p_book_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select md5(jsonb_build_object(
           'title', b.title,
           'subtitle', b.subtitle,
           'trim', br.trim_size,
           'topic_text', br.topic_text,
           'target_reader', br.target_reader,
           'reader_problem', br.reader_problem,
           'promise_draft', br.promise_draft,
           'stance', br.options -> 'stance',
           'standout', br.options -> 'standout',
           'references', br.options -> 'references',
           'loves', coalesce(i.loves, '[]'::jsonb),
           'hates', coalesce(i.hates, '[]'::jsonb),
           'gaps', coalesce(i.gaps, '[]'::jsonb),
           'competitors', coalesce((
             select jsonb_agg(co.title order by co.created_at, co.id)
               from public.competitors co where co.book_id = b.id), '[]'::jsonb),
           'sources', coalesce((
             select jsonb_agg(jsonb_build_array(rs.kind, rs.body, rs.citation) order by rs.created_at, rs.id)
               from public.research_sources rs where rs.book_id = b.id), '[]'::jsonb),
           'locked_at', extract(epoch from po.locked_at),
           'one_sentence', po.one_sentence,
           'reader_promise', po.reader_promise,
           'style', coalesce(f.style, 'classic'),
           'copyright', coalesce((f.parts ->> 'copyright')::boolean, true),
           'chapters', coalesce((
             select jsonb_agg(jsonb_build_array(
                      c.id, c.kind, c.title, c.objective, c.needs_review,
                      coalesce((
                        select jsonb_agg(jsonb_build_array(s.id, s.title, s.word_target, s.status, s.needs_review) order by s.position)
                          from public.sections s where s.chapter_id = c.id), '[]'::jsonb))
                    order by c.position)
               from public.chapters c where c.book_id = b.id), '[]'::jsonb))::text)
    from public.books b
    left join public.book_briefs br on br.book_id = b.id
    left join public.research_insights i on i.book_id = b.id
    left join public.positioning po on po.book_id = b.id
    left join public.book_formats f on f.book_id = b.id
   where b.id = p_book_id
$$;

comment on function public.qc_inputs_key(uuid) is
  'E14: md5 of every input the free 07 rules read besides the text (plan 3.2, owner Q3). Null for a book the caller cannot see. Under the caller''s RLS.';

-- ---------------------------------------------------------------------------
-- 3. qc_runs
-- ---------------------------------------------------------------------------
-- Structure checks only: js/qc-rules.js decides the content. case, not "and"
-- (as 0022 and 0025): SQL does not promise left-to-right order, and the jsonb
-- functions raise an error on the wrong type.

-- A rule id of the free checks (plan section 5). Group 6, promise_drift, is an
-- AI result: it is never in a run.
create or replace function public.qc_rule_ok(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p = any (array[
    'not_final', 'no_text', 'needs_review', 'chapter_review', 'under_target', 'stopped_run', 'cut_off',
    'verify_mark', 'number_no_source', 'source_not_named',
    'same_sentence', 'same_sentence_here', 'same_paragraph', 'overused_word',
    'chapter_missing', 'section_number', 'preview', 'leftover',
    'two_spellings', 'us_uk',
    'web_link', 'emoji', 'missing_char', 'length', 'disclaimer']), false)
$$;

comment on function public.qc_rule_ok(text) is
  'E14: a rule id of the free 07 checks (plan section 5), groups 1 to 5 and 7.';

-- A uuid, written as a JSON string.
create or replace function public.qc_uuid_ok(j jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(j) is distinct from 'string' then false
    else (j #>> '{}') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  end
$$;

comment on function public.qc_uuid_ok(jsonb) is
  'E14: a JSON string that is a lower-case uuid.';

-- A whole number from 0 to 999,999,999. Small enough to cast to int.
create or replace function public.qc_count_ok(j jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(j) is distinct from 'number' then false
    else (j #>> '{}') ~ '^[0-9]{1,9}$'
  end
$$;

comment on function public.qc_count_ok(jsonb) is
  'E14: a JSON whole number from 0 to 999,999,999.';

-- One issue: { g, rule, key, section_id, version_id, start, end, message, quote }.
-- A spot has both offsets or neither.
create or replace function public.qc_item_ok(e jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(e) is distinct from 'object' then false
    when (select array_agg(k order by k) from jsonb_object_keys(e) k)
         is distinct from array['end', 'g', 'key', 'message', 'quote', 'rule', 'section_id', 'start', 'version_id'] then false
    when jsonb_typeof(e -> 'g') <> 'number'
      or jsonb_typeof(e -> 'rule') <> 'string'
      or jsonb_typeof(e -> 'key') <> 'string'
      or jsonb_typeof(e -> 'message') <> 'string'
      or jsonb_typeof(e -> 'quote') <> 'string' then false
    when e ->> 'g' not in ('1', '2', '3', '4', '5', '7') then false
    when not public.qc_rule_ok(e ->> 'rule') then false
    when char_length(e ->> 'key') not between 1 and 300 then false
    when char_length(e ->> 'message') not between 1 and 300 or public.text_is_blank(e ->> 'message') then false
    when char_length(e ->> 'quote') > 300 then false
    when jsonb_typeof(e -> 'section_id') <> 'null' and not public.qc_uuid_ok(e -> 'section_id') then false
    when jsonb_typeof(e -> 'version_id') <> 'null' and not public.qc_uuid_ok(e -> 'version_id') then false
    when jsonb_typeof(e -> 'start') = 'null' then jsonb_typeof(e -> 'end') = 'null'
    when not public.qc_count_ok(e -> 'start') or not public.qc_count_ok(e -> 'end') then false
    else (e ->> 'start')::int <= (e ->> 'end')::int
  end
$$;

comment on function public.qc_item_ok(jsonb) is
  'E14: structure check for one issue in qc_runs.results.';

-- One line of "Sources named in the text": { citation, sections: [uuid] }.
create or replace function public.qc_source_ok(e jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(e) is distinct from 'object' then false
    when (select array_agg(k order by k) from jsonb_object_keys(e) k)
         is distinct from array['citation', 'sections'] then false
    when jsonb_typeof(e -> 'citation') <> 'string' or jsonb_typeof(e -> 'sections') <> 'array' then false
    when char_length(e ->> 'citation') not between 1 and 200 then false
    when jsonb_array_length(e -> 'sections') > 400 then false
    else not exists (select 1 from jsonb_array_elements(e -> 'sections') x where not public.qc_uuid_ok(x))
  end
$$;

comment on function public.qc_source_ok(jsonb) is
  'E14: structure check for one line of qc_runs.results.sources.';

-- { items: [...], more: {"1": n, ...}, sources: [...], notes: { unsaved: n, running: n } }
create or replace function public.qc_results_ok(j jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(j) is distinct from 'object' then false
    when (select array_agg(k order by k) from jsonb_object_keys(j) k)
         is distinct from array['items', 'more', 'notes', 'sources'] then false
    when jsonb_typeof(j -> 'items') <> 'array'
      or jsonb_typeof(j -> 'more') <> 'object'
      or jsonb_typeof(j -> 'notes') <> 'object'
      or jsonb_typeof(j -> 'sources') <> 'array' then false
    when jsonb_array_length(j -> 'items') > 400 or jsonb_array_length(j -> 'sources') > 50 then false
    when exists (select 1 from jsonb_array_elements(j -> 'items') e where not public.qc_item_ok(e)) then false
    when exists (select 1 from jsonb_each(j -> 'more') m(k, v)
                  where k not in ('1', '2', '3', '4', '5', '7') or not public.qc_count_ok(v)) then false
    when exists (select 1 from jsonb_array_elements(j -> 'sources') e where not public.qc_source_ok(e)) then false
    when (select array_agg(k order by k) from jsonb_object_keys(j -> 'notes') k)
         is distinct from array['running', 'unsaved'] then false
    else public.qc_count_ok(j -> 'notes' -> 'unsaved') and public.qc_count_ok(j -> 'notes' -> 'running')
  end
$$;

comment on function public.qc_results_ok(jsonb) is
  'E14: structure check for qc_runs.results: at most 400 items and 50 sources, more per group, notes.';

create table public.qc_runs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_id     uuid not null references public.books (id) on delete cascade,
  versions    uuid[] not null,
  inputs_key  text not null,
  results     jsonb not null,
  sections    int not null,
  words       int not null,
  style       text not null,
  created_at  timestamptz not null default now(),
  constraint qc_runs_versions_check check (cardinality(versions) between 1 and 2000 and array_position(versions, null) is null),
  constraint qc_runs_inputs_key_check check (inputs_key ~ '^[0-9a-f]{32}$'),
  constraint qc_runs_results_shape_check check (public.qc_results_ok(results)),
  constraint qc_runs_results_size_check check (octet_length(results::text) <= 400000),
  constraint qc_runs_sections_check check (sections between 1 and 2000),
  constraint qc_runs_words_check check (words between 0 and 1000000),
  constraint qc_runs_style_check check (style in ('classic', 'modern', 'clean', 'warm'))
);

create index qc_runs_user_id_idx on public.qc_runs (user_id);
create index qc_runs_book_created_idx on public.qc_runs (book_id, created_at desc);

comment on table public.qc_runs is
  'E14: one row per 07 Quality Control run, the newest 5 per book. Written by the browser; the guard refuses a run whose key is not today''s.';
comment on column public.qc_runs.versions is
  'qc_versions() at the time of the run. The guard refuses any other list.';
comment on column public.qc_runs.inputs_key is
  'qc_inputs_key() at the time of the run. The guard refuses any other key.';
comment on column public.qc_runs.style is
  'The 08 style whose font the check used.';

alter table public.qc_runs enable row level security;

create policy "qc_runs_select_own" on public.qc_runs
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "qc_runs_insert_own" on public.qc_runs
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b
                where b.id = book_id and b.user_id = (select auth.uid()))
  );

-- A run is recorded once and never changed or removed by hand.
revoke update, delete, truncate on public.qc_runs from anon, authenticated;
-- anon has no uid, so the guard below would take it for the server and answer
-- "qc_stale" before the policy refuses the row. It gets no insert at all.
revoke insert on public.qc_runs from anon;

-- SECURITY DEFINER, as book_exports_guard (0025): the clean-up of old rows (d)
-- needs a delete the API roles do not have. Everything it reads or removes is
-- limited to the row's own user and book, checked first (a). search_path is
-- empty, so every name is schema-qualified.
create or replace function public.qc_runs_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select b.user_id into v_owner from public.books b where b.id = new.book_id;
  -- A book that does not exist: the foreign key (23503) refuses the row.
  -- Another user's book, for a signed-in caller: the insert policy (42501)
  -- refuses the row, as if the book did not exist. Nothing is read or locked.
  if v_owner is null or (v_owner <> (select auth.uid()) and (select auth.uid()) is not null) then
    return new;
  end if;
  -- a. The book's owner (the service role bypasses RLS, so it is checked here).
  if v_owner <> new.user_id then
    raise exception 'qc_owner'
      using errcode = 'P0001',
            detail = 'A run belongs to the owner of its book.';
  end if;
  -- b. One run at a time per book.
  perform 1 from public.books b where b.id = new.book_id for update;
  -- c. The book the run read is the book today. (A wrong shape is left to the
  -- table checks, which run after this trigger.)
  if new.versions is distinct from public.qc_versions(new.book_id)
     or new.inputs_key is distinct from public.qc_inputs_key(new.book_id) then
    raise exception 'qc_stale'
      using errcode = 'P0001',
            detail = 'Your book changed while the checks ran. Run again.';
  end if;
  -- d. Keep the newest 4 older rows, so the book has at most 5 with this one.
  delete from public.qc_runs r
   where r.book_id = new.book_id
     and r.user_id = new.user_id
     and r.id not in (select r2.id from public.qc_runs r2
                       where r2.book_id = new.book_id
                       order by r2.created_at desc, r2.id desc
                       limit 4);
  return new;
end;
$$;

comment on function public.qc_runs_guard() is
  'Trigger (E14): qc_runs.user_id is the book''s owner (P0001 "qc_owner"); versions and inputs_key equal today''s (P0001 "qc_stale"); keeps the newest 5 runs per book.';

create trigger qc_runs_guard
  before insert on public.qc_runs
  for each row execute function public.qc_runs_guard();

-- ---------------------------------------------------------------------------
-- 4. qc_dismissed
-- ---------------------------------------------------------------------------
create table public.qc_dismissed (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_id     uuid not null references public.books (id) on delete cascade,
  section_id  uuid references public.sections (id) on delete cascade,
  rule        text not null,
  issue_key   text not null,
  label       text not null,
  created_at  timestamptz not null default now(),
  constraint qc_dismissed_book_rule_key_key unique (book_id, rule, issue_key),
  constraint qc_dismissed_rule_check check (public.qc_rule_ok(rule) or rule = 'promise_drift'),
  constraint qc_dismissed_issue_key_check check (char_length(issue_key) between 1 and 300 and not public.text_is_blank(issue_key)),
  constraint qc_dismissed_label_check check (char_length(label) between 1 and 300 and not public.text_is_blank(label))
);

create index qc_dismissed_user_id_idx on public.qc_dismissed (user_id);
create index qc_dismissed_section_id_idx on public.qc_dismissed (section_id);
-- book_id is covered by the leading column of qc_dismissed_book_rule_key_key.

comment on table public.qc_dismissed is
  'E14: Mark as OK. The key holds the text at the spot, so a changed spot brings the issue back. A row whose key no longer matches stays harmless.';
comment on column public.qc_dismissed.section_id is
  'Null for a book-wide issue.';
comment on column public.qc_dismissed.label is
  'What the "Marked as OK" list shows.';

alter table public.qc_dismissed enable row level security;

create policy "qc_dismissed_select_own" on public.qc_dismissed
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "qc_dismissed_insert_own" on public.qc_dismissed
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b
                where b.id = book_id and b.user_id = (select auth.uid()))
  );

-- Undo.
create policy "qc_dismissed_delete_own" on public.qc_dismissed
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke update, truncate on public.qc_dismissed from anon, authenticated;

-- SECURITY INVOKER: it reads under the caller's RLS, so another user's book or
-- section is never found. The service role bypasses RLS, so the owner and the
-- section are checked here too.
create or replace function public.qc_dismissed_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  -- c. One at a time per book (the book row is locked).
  select b.user_id into v_owner from public.books b where b.id = new.book_id for update;
  -- A book that does not exist: the foreign key (23503). Another user's book,
  -- for a signed-in caller: not found here, so the insert policy (42501).
  if v_owner is null then
    return new;
  end if;
  -- a. The book's owner.
  if v_owner <> new.user_id then
    raise exception 'qc_dismissed_owner'
      using errcode = 'P0001',
            detail = 'A dismissed issue belongs to the owner of its book.';
  end if;
  -- b. A section of this book.
  if new.section_id is not null
     and not exists (select 1 from public.sections s
                       join public.chapters c on c.id = s.chapter_id
                      where s.id = new.section_id and c.book_id = new.book_id) then
    raise exception 'qc_dismissed_section'
      using errcode = 'P0001',
            detail = 'A dismissed issue points to a section of its own book.';
  end if;
  -- c. At most 500 per book.
  if (select count(*) from public.qc_dismissed d where d.book_id = new.book_id) >= 500 then
    raise exception 'qc_dismissed_limit'
      using errcode = 'P0001',
            detail = 'This book has 500 issues marked as OK. Undo some first.';
  end if;
  return new;
end;
$$;

comment on function public.qc_dismissed_guard() is
  'Trigger (E14): qc_dismissed.user_id is the book''s owner (P0001 "qc_dismissed_owner"); section_id is null or a section of this book (P0001 "qc_dismissed_section"); at most 500 rows per book (P0001 "qc_dismissed_limit").';

create trigger qc_dismissed_guard
  before insert on public.qc_dismissed
  for each row execute function public.qc_dismissed_guard();

-- ---------------------------------------------------------------------------
-- 5. book_checks
-- ---------------------------------------------------------------------------
create table public.book_checks (
  chapter_id  uuid primary key references public.chapters (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  book_id     uuid not null references public.books (id) on delete cascade,
  verdict     text not null,
  reason      text not null,
  quote       text not null,
  section_id  uuid references public.sections (id) on delete set null,
  unsourced   text[] not null default '{}',
  versions    uuid[] not null,
  words       int not null,
  inputs_key  text not null,
  checked_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint book_checks_verdict_check check (verdict in ('keeps', 'drifts')),
  constraint book_checks_reason_check check (char_length(reason) between 1 and 300 and not public.text_is_blank(reason)),
  constraint book_checks_quote_check check (quote = '' or (char_length(quote) <= 300 and not public.text_is_blank(quote))),
  constraint book_checks_quote_section_check check (quote <> '' or section_id is null),
  constraint book_checks_unsourced_check check (public.text_items_ok(unsourced, 10, 20)),
  constraint book_checks_versions_check check (cardinality(versions) between 1 and 12 and array_position(versions, null) is null),
  constraint book_checks_words_check check (words between 50 and 6000),
  constraint book_checks_inputs_key_check check (inputs_key ~ '^[0-9a-f]{16}$')
);

create index book_checks_user_id_idx on public.book_checks (user_id);
create index book_checks_book_id_idx on public.book_checks (book_id);
create index book_checks_section_id_idx on public.book_checks (section_id);

comment on table public.book_checks is
  'E14: the promise check, one row per chapter (stage promise_check). Written by the service role only. Advice only: it never changes the chapter.';
comment on column public.book_checks.section_id is
  'The section that holds the quote. Null when the AI quote was not found, or that section was deleted.';
comment on column public.book_checks.inputs_key is
  'Fingerprint of what the check read (generate lib/promise_check.ts promiseKey; the browser computes the same).';

create trigger book_checks_set_updated_at
  before update on public.book_checks
  for each row execute function public.set_updated_at();

alter table public.book_checks enable row level security;

create policy "book_checks_select_own" on public.book_checks
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Only the service role writes (it bypasses RLS). Supabase grants every new
-- table to the API roles by default, so take the write privileges back.
-- anon keeps the default select grant, like every other table: with no anon
-- policy, RLS shows it no rows.
revoke insert, update, delete, truncate on public.book_checks from anon, authenticated;

-- The service role bypasses RLS, so the owner, the section and the versions are
-- checked here. Checked on insert, and on an update only when the column
-- changes. A book delete cascades in trigger-name order, which nothing promises:
-- the set null on section_id may meet a chapter or versions already gone, and
-- it must pass.
create or replace function public.book_checks_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_moved boolean := tg_op = 'UPDATE' and new.chapter_id is distinct from old.chapter_id;
begin
  -- a. The chapter's owner and book. Chapters only.
  if (tg_op = 'INSERT' or (new.chapter_id, new.user_id, new.book_id) is distinct from (old.chapter_id, old.user_id, old.book_id))
     and not exists (select 1 from public.chapters c
                      where c.id = new.chapter_id and c.user_id = new.user_id
                        and c.book_id = new.book_id and c.kind = 'chapter') then
    raise exception 'book_check_owner'
      using errcode = 'P0001',
            detail = 'A promise check belongs to the owner and the book of its chapter.';
  end if;
  -- b. A section of this chapter.
  if new.section_id is not null
     and (tg_op = 'INSERT' or v_moved or new.section_id is distinct from old.section_id)
     and not exists (select 1 from public.sections s
                      where s.id = new.section_id and s.chapter_id = new.chapter_id) then
    raise exception 'book_check_section'
      using errcode = 'P0001',
            detail = 'A promise check quotes a section of its own chapter.';
  end if;
  -- c. Every version: a version of a section of this chapter, no repeats.
  -- (A wrong shape is left to the table checks, which run after this trigger.)
  if (tg_op = 'INSERT' or v_moved or new.versions is distinct from old.versions)
     and new.versions is not null and cardinality(new.versions) > 0 and array_position(new.versions, null) is null
     and ((select count(distinct x) from unnest(new.versions) x) <> cardinality(new.versions)
          or (select count(*)
                from public.section_versions v
                join public.sections s on s.id = v.section_id
               where v.id = any (new.versions)
                 and s.chapter_id = new.chapter_id) <> cardinality(new.versions)) then
    raise exception 'book_check_version'
      using errcode = 'P0001',
            detail = 'A promise check reads versions of its own chapter.';
  end if;
  return new;
end;
$$;

comment on function public.book_checks_guard() is
  'Trigger (E14): book_checks.user_id and book_id match a chapter of kind chapter (P0001 "book_check_owner"); section_id is null or a section of this chapter (P0001 "book_check_section"); every version belongs to this chapter, no repeats (P0001 "book_check_version").';

create trigger book_checks_guard
  before insert or update on public.book_checks
  for each row execute function public.book_checks_guard();

-- ---------------------------------------------------------------------------
-- 6. Reads
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER, one statement (one snapshot). Null for a book that is not
-- the caller's.
--   data         export_json(book), with word_target
--   versions     qc_versions(book)
--   inputs_key   qc_inputs_key(book)
--   format       style, parts, chapter_label; null before 08
--   positioning  locked_at, one_sentence, reader_promise, approach, lacks,
--                selling_points, focus_tags; or null
--   last_run     id, created_at, versions, inputs_key, results, sections,
--                words, style; or null
--   current      true when last_run matches versions and inputs_key
--   dismissed    id, section_id, rule, issue_key, label, created_at, newest first
--   promise      the book_checks rows, without user_id, in book order
--   now          the server time
create or replace function public.qc_json(p_book_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with today as (
    select public.qc_versions(p_book_id) as versions, public.qc_inputs_key(p_book_id) as inputs_key
  ), last as (
    select r.id, r.created_at, r.versions, r.inputs_key, r.results, r.sections, r.words, r.style
      from public.qc_runs r
     where r.book_id = p_book_id
     order by r.created_at desc, r.id desc
     limit 1
  )
  select jsonb_build_object(
    'data', public.export_json(b.id),
    'versions', to_jsonb(t.versions),
    'inputs_key', t.inputs_key,
    'format', (select jsonb_build_object('style', f.style, 'parts', f.parts, 'chapter_label', f.chapter_label)
                 from public.book_formats f where f.book_id = b.id),
    'positioning', (select jsonb_build_object(
                             'locked_at', po.locked_at,
                             'one_sentence', po.one_sentence,
                             'reader_promise', po.reader_promise,
                             'approach', po.approach,
                             'lacks', po.lacks,
                             'selling_points', po.selling_points,
                             'focus_tags', po.focus_tags)
                      from public.positioning po where po.book_id = b.id),
    'last_run', (select to_jsonb(l) from last l),
    'current', coalesce((select l.versions = t.versions and l.inputs_key = t.inputs_key from last l), false),
    'dismissed', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id,
               'section_id', d.section_id,
               'rule', d.rule,
               'issue_key', d.issue_key,
               'label', d.label,
               'created_at', d.created_at) order by d.created_at desc, d.id desc)
        from public.qc_dismissed d where d.book_id = b.id), '[]'::jsonb),
    'promise', coalesce((
      select jsonb_agg(to_jsonb(k) - 'user_id' order by c.position)
        from public.book_checks k
        join public.chapters c on c.id = k.chapter_id
       where k.book_id = b.id), '[]'::jsonb),
    'now', now())
  from public.books b
  cross join today t
  where b.id = p_book_id
$$;

comment on function public.qc_json(uuid) is
  'E14: everything 07 Quality Control reads for one book, under the caller''s RLS (null when the book is not the caller''s). See 0028 for the shape.';

-- The 07 mark. No row before the first run. No text leaves the database.
create or replace function public.qc_mark(p_book_id uuid)
returns table (checked_at timestamptz, current boolean)
language sql
stable
set search_path = ''
as $$
  select r.created_at,
         r.versions = public.qc_versions(p_book_id)
         and r.inputs_key is not distinct from public.qc_inputs_key(p_book_id)
    from public.qc_runs r
   where r.book_id = p_book_id
   order by r.created_at desc, r.id desc
   limit 1
$$;

comment on function public.qc_mark(uuid) is
  'E14: the last run time and whether it is current, for the 07 mark. No row before the first run. Under the caller''s RLS.';

-- ---------------------------------------------------------------------------
-- 7. Grants. Supabase gives anon EXECUTE on new functions by default.
-- ---------------------------------------------------------------------------
-- The shape helpers run inside the table checks, as the caller.
revoke execute on function public.qc_versions(uuid) from public, anon;
revoke execute on function public.qc_inputs_key(uuid) from public, anon;
revoke execute on function public.qc_json(uuid) from public, anon;
revoke execute on function public.qc_mark(uuid) from public, anon;
revoke execute on function public.qc_rule_ok(text) from public, anon;
revoke execute on function public.qc_uuid_ok(jsonb) from public, anon;
revoke execute on function public.qc_count_ok(jsonb) from public, anon;
revoke execute on function public.qc_item_ok(jsonb) from public, anon;
revoke execute on function public.qc_source_ok(jsonb) from public, anon;
revoke execute on function public.qc_results_ok(jsonb) from public, anon;
grant execute on function public.qc_versions(uuid) to authenticated;
grant execute on function public.qc_inputs_key(uuid) to authenticated;
grant execute on function public.qc_json(uuid) to authenticated;
grant execute on function public.qc_mark(uuid) to authenticated;
grant execute on function public.qc_rule_ok(text) to authenticated;
grant execute on function public.qc_uuid_ok(jsonb) to authenticated;
grant execute on function public.qc_count_ok(jsonb) to authenticated;
grant execute on function public.qc_item_ok(jsonb) to authenticated;
grant execute on function public.qc_source_ok(jsonb) to authenticated;
grant execute on function public.qc_results_ok(jsonb) to authenticated;
revoke execute on function public.qc_runs_guard() from public, anon, authenticated;
revoke execute on function public.qc_dismissed_guard() from public, anon, authenticated;
revoke execute on function public.book_checks_guard() from public, anon, authenticated;
