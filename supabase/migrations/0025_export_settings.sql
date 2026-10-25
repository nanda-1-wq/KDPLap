-- 0025_export_settings.sql
-- KDP Lab · E11 · Export (design 24b) and Settings (design 25b).
-- Plan: docs/reviews/2026-10-25-e11-build-plan.md. No AI call reads or writes
-- anything here; Export and Settings never call the AI.
--
-- 1. user_settings.display_name: the name the sidebar shows (owner rule,
--    2026-10-25: the footer shows the name only, never the email). Null, or
--    1 to 60 characters with no space at either end (the browser trims).
--    Null means: use the Google profile name, else "Your account".
-- 2. book_exports: one row per export (DOCX or Markdown), owned by the writer.
--      format    "docx" | "md".
--      include   "all" (every section with text) | "final" (Final only).
--      parts     the book parts that were on: title, copyright, contents,
--                intro, conclusion, about (all six keys, booleans only).
--      versions  the exported section versions, in book order (1 to 2,000).
--      snapshot  set by the guard from the database, never from the browser:
--                title, subtitle, pen name, trim size, md5 of the pen name
--                bio, include and parts.
--    Row Level Security: a user reads and adds only their own rows, on their
--    own books. No update and no delete (privileges revoked); rows go with
--    their book or user (cascade), and the guard keeps the newest 20 per
--    format.
--    A guard trigger, for every role (the service role bypasses RLS):
--      a. user_id is the book's owner (P0001 "export_owner"; a book the
--         caller cannot see is left to the insert policy, 42501);
--      b. every version is a version of a section of this book, owned by
--         the same user, with no repeats (P0001 "export_version_not_in_book");
--      c. snapshot is set from the database;
--      d. at most 20 exports per book and format: older rows of the same
--         format are removed, so Markdown backups never push out the DOCX
--         export the Books badge reads (the book row is locked so two tabs
--         cannot pass the cap together).
-- 3. export_json(book): everything the Export dialog reads, in one read.
-- 4. export_badges(): the Books page badge. The last DOCX export per book
--    and whether the book changed since (the rule lives only here).
-- 5. usage_month(): this month's counted AI tokens, summed on the server
--    (the browser read stopped at 1,000 rows), by stage and model.
--
-- Checked before writing (read-only, 2026-10-25): last migration
-- 20261016122500 (0024 kept_findings), 21 public tables, no book_exports
-- table, no user_settings.display_name. public.text_is_blank exists (0019).
-- A new nullable column and a new table: no existing row can fail them.

-- ---------------------------------------------------------------------------
-- 1. user_settings.display_name
-- ---------------------------------------------------------------------------
alter table public.user_settings add column display_name text;

alter table public.user_settings add constraint user_settings_display_name_check
  check (display_name is null or (char_length(display_name) between 1 and 60 and display_name = btrim(display_name)));

comment on column public.user_settings.display_name is
  'E11: the name shown in the sidebar (1 to 60 characters, trimmed). Null: the Google profile name, else "Your account". Never the email.';

-- ---------------------------------------------------------------------------
-- 2. book_exports
-- ---------------------------------------------------------------------------

-- parts: exactly the six keys, each a boolean.
create or replace function public.export_parts_ok(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- case, not "and" (as 0008): SQL does not promise left-to-right order, and
  -- jsonb_object_keys / jsonb_each raise an error on the wrong type.
  select case
    when jsonb_typeof(p) is distinct from 'object' then false
    when (select array_agg(k order by k) from jsonb_object_keys(p) k)
         is distinct from array['about', 'conclusion', 'contents', 'copyright', 'intro', 'title'] then false
    else not exists (select 1 from jsonb_each(p) e(k, v) where jsonb_typeof(v) <> 'boolean')
  end
$$;

comment on function public.export_parts_ok(jsonb) is
  'E11: book_exports.parts has exactly title, copyright, contents, intro, conclusion and about, each a boolean.';

create table public.book_exports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_id     uuid not null references public.books (id) on delete cascade,
  format      text not null,
  include     text not null,
  parts       jsonb not null,
  versions    uuid[] not null,
  snapshot    jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  constraint book_exports_format_check check (format in ('docx', 'md')),
  constraint book_exports_include_check check (include in ('all', 'final')),
  constraint book_exports_parts_check check (public.export_parts_ok(parts)),
  constraint book_exports_versions_check check (cardinality(versions) between 1 and 2000 and array_position(versions, null) is null)
);

create index book_exports_user_id_idx on public.book_exports (user_id);
create index book_exports_book_created_idx on public.book_exports (book_id, created_at desc);

comment on table public.book_exports is
  'E11: one row per export (design 24b). The Books badge compares the last DOCX export with the book today (export_badges). The snapshot is set by the guard from the database.';
comment on column public.book_exports.versions is
  'The exported section versions, in book order. Every one is a version of a section of this book.';
comment on column public.book_exports.snapshot is
  'Set by book_exports_guard: title, subtitle, pen_name, trim, bio_md5, include, parts. Anything the browser sends is replaced.';

alter table public.book_exports enable row level security;

create policy "book_exports_select_own" on public.book_exports
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "book_exports_insert_own" on public.book_exports
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b
                where b.id = book_id and b.user_id = (select auth.uid()))
  );

-- An export is recorded once and never changed or removed by hand.
revoke update, delete, truncate on public.book_exports from anon, authenticated;

-- SECURITY DEFINER: the clean-up of old rows (d) needs a delete the API
-- roles do not have. Everything it reads or removes is limited to the row's
-- own user and book, checked first (a, b). search_path is empty, so every
-- name is schema-qualified.
create or replace function public.book_exports_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_book public.books%rowtype;
  v_pen text;
  v_bio text;
  v_trim text;
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
    raise exception 'export_owner'
      using errcode = 'P0001',
            detail = 'An export belongs to the owner of its book.';
  end if;
  -- d. One export at a time per book (the book row is locked).
  select * into v_book from public.books b where b.id = new.book_id for update;
  -- b. Every version: a version of a section of this book, the same owner, no repeats.
  -- (A wrong shape is left to the table checks, which run after this trigger.)
  if new.versions is not null and cardinality(new.versions) > 0 and array_position(new.versions, null) is null
     and ((select count(distinct x) from unnest(new.versions) x) <> cardinality(new.versions)
          or (select count(*)
                from public.section_versions v
                join public.sections s on s.id = v.section_id
                join public.chapters c on c.id = s.chapter_id
               where v.id = any (new.versions)
                 and c.book_id = new.book_id
                 and v.user_id = new.user_id) <> cardinality(new.versions)) then
    raise exception 'export_version_not_in_book'
      using errcode = 'P0001',
            detail = 'Every exported version must belong to a section of this book.';
  end if;
  -- c. The snapshot, from the database.
  select p.name, p.bio_text into v_pen, v_bio from public.pen_names p where p.id = v_book.pen_name_id;
  select br.trim_size into v_trim from public.book_briefs br where br.book_id = new.book_id;
  new.snapshot := jsonb_build_object(
    'title', v_book.title,
    'subtitle', v_book.subtitle,
    'pen_name', v_pen,
    'trim', v_trim,
    'bio_md5', md5(coalesce(v_bio, '')),
    'include', new.include,
    'parts', new.parts);
  -- d. Keep the newest 19 older rows of this format, so the book has at most
  -- 20 per format with this one.
  delete from public.book_exports e
   where e.book_id = new.book_id
     and e.format = new.format
     and e.user_id = new.user_id
     and e.id not in (select e2.id from public.book_exports e2
                       where e2.book_id = new.book_id
                         and e2.format = new.format
                       order by e2.created_at desc, e2.id desc
                       limit 19);
  return new;
end;
$$;

comment on function public.book_exports_guard() is
  'Trigger (E11): book_exports.user_id is the book''s owner (P0001 "export_owner"); every version belongs to this book (P0001 "export_version_not_in_book"); sets the snapshot from the database; keeps the newest 20 exports per book and format.';

create trigger book_exports_guard
  before insert on public.book_exports
  for each row execute function public.book_exports_guard();

revoke execute on function public.book_exports_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. export_json(book): the Export dialog's one read
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER: every read runs under the caller's Row Level Security.
-- A book that is not the caller's (or does not exist) gives null.
--   book      title, subtitle, pen_name, bio, trim
--   known     what kdpTextChecks.knownOf reads: brief, research (insights,
--             competitors, sources); the outline is in chapters
--   chapters  in order: id, kind, position, title, objective, needs_review,
--             sections in order: id, position, title, status, needs_review,
--             version (id, version_no, content, partial, word_count) or null,
--             ai ("draft": the history has a Generate version; "edits": it
--             has an Improve menu version (Edit and format, Improve, Expand,
--             Shorten, Humanize, Custom); else "none": only manual saves and
--             restores, which are not AI),
--             unsaved (a draft that differs from the saved version),
--             run (started_at, heartbeat_at) while a Generate run is "running"
--   now       the server time, for the run freshness rule (0020)
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
  'E11: everything the Export dialog reads for one book, under the caller''s RLS (null when the book is not the caller''s). See 0025 for the shape.';

revoke execute on function public.export_json(uuid) from public, anon;
grant execute on function public.export_json(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. export_badges(): the Books page badge
-- ---------------------------------------------------------------------------
-- The last DOCX export of each of the caller's books, and "changed": true when
-- the title, subtitle, pen name or trim size differ from its snapshot, the
-- pen name bio differs while About the author was in the file, or the list of
-- today's current versions of the sections it would include differs from the
-- exported list. A section is included when its current version has text, it
-- is Final when include = "final", and its chapter is a chapter, or an intro
-- or conclusion whose part was on. Order: chapter position, section position.
-- The Export dialog (js/export-rules.js) uses the same rule; both test files
-- carry the same cases.
create or replace function public.export_badges()
returns table (book_id uuid, exported_at timestamptz, changed boolean)
language sql
stable
set search_path = ''
as $$
  with last as (
    select distinct on (e.book_id) e.book_id, e.created_at, e.include, e.parts, e.versions, e.snapshot
      from public.book_exports e
     where e.format = 'docx'
     order by e.book_id, e.created_at desc, e.id desc
  )
  select l.book_id,
         l.created_at,
         (b.title is distinct from l.snapshot ->> 'title')
         or (b.subtitle is distinct from l.snapshot ->> 'subtitle')
         or (p.name is distinct from l.snapshot ->> 'pen_name')
         or (br.trim_size is distinct from l.snapshot ->> 'trim')
         or ((l.parts ->> 'about')::boolean and md5(coalesce(p.bio_text, '')) is distinct from l.snapshot ->> 'bio_md5')
         or (coalesce((
               select array_agg(v.id order by c.position, s.position)
                 from public.chapters c
                 join public.sections s on s.chapter_id = c.id
                 join public.section_versions v on v.id = s.current_version_id
                where c.book_id = l.book_id
                  and not public.text_is_blank(v.content)
                  and (l.include = 'all' or s.status = 'final')
                  and (c.kind = 'chapter'
                       or (c.kind = 'intro' and (l.parts ->> 'intro')::boolean)
                       or (c.kind = 'conclusion' and (l.parts ->> 'conclusion')::boolean))
             ), '{}'::uuid[]) is distinct from l.versions)
    from last l
    join public.books b on b.id = l.book_id
    left join public.pen_names p on p.id = b.pen_name_id
    left join public.book_briefs br on br.book_id = b.id
$$;

comment on function public.export_badges() is
  'E11: per book, the last DOCX export time and whether the book changed since (design 24b, state 10). Under the caller''s RLS.';

revoke execute on function public.export_badges() from public, anon;
grant execute on function public.export_badges() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. usage_month(): this month's AI usage (Settings, Books)
-- ---------------------------------------------------------------------------
-- Counted calls only, from the 1st of the month at 00:00 UTC, like the
-- generate function (lib/limits.ts monthStartUtc, sumCountedTokensSince).
--   month_start, resets (the 1st of next month, UTC), limit (the user's
--   monthly_token_limit, or the 2,000,000 default before the settings row
--   exists), tokens, by_stage: [{ stage, model, calls, input, output }]
--   (most tokens first).
create or replace function public.usage_month()
returns jsonb
language sql
stable
set search_path = ''
as $$
  with m as (
    select (date_trunc('month', now() at time zone 'utc') at time zone 'utc') as start
  ), rows as (
    select u.stage, u.model, u.input_tokens, u.output_tokens
      from public.ai_usage u, m
     where u.user_id = (select auth.uid())
       and u.counted
       and u.created_at >= m.start
  ), stages as (
    select r.stage, r.model, count(*) as calls, sum(r.input_tokens) as input, sum(r.output_tokens) as output
      from rows r
     group by r.stage, r.model
  )
  select jsonb_build_object(
    'month_start', m.start,
    'resets', m.start + interval '1 month',
    'limit', coalesce((select s.monthly_token_limit from public.user_settings s where s.user_id = (select auth.uid())), 2000000),
    'tokens', coalesce((select sum(r.input_tokens + r.output_tokens) from rows r), 0),
    'by_stage', coalesce((select jsonb_agg(jsonb_build_object(
                                   'stage', st.stage, 'model', st.model, 'calls', st.calls,
                                   'input', st.input, 'output', st.output)
                                 order by st.input + st.output desc, st.stage, st.model)
                            from stages st), '[]'::jsonb))
  from m
$$;

comment on function public.usage_month() is
  'E11: the caller''s counted AI tokens this month (from the 1st, UTC), the limit and the split by stage and model. Summed on the server.';

revoke execute on function public.usage_month() from public, anon;
grant execute on function public.usage_month() to authenticated;

create index ai_usage_user_created_idx on public.ai_usage (user_id, created_at);
