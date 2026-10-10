-- 0020_generate_section.sql
-- KDP Lab · E10.2 · Step 06 Write: Generate section (streaming).
--
-- The generate function (stage section_write, service role) writes one
-- section with the AI and saves the text itself. The browser never saves AI
-- text. Everything here is called by the function, except
-- request_section_stop (the Stop button) and the read of section_runs.
--
-- 1. section_runs: one row per section, its last Generate run.
--      state running | ended. A running run is fresh while its heartbeat is
--      under 20 s old and it started under 160 s ago; otherwise it is stale.
--      content holds the new text so far (crash copy, written every second),
--      cleared when the run ends.
--    RLS: a user reads only their own rows. Insert and delete are the service
--    role's only. A user update passes only through request_section_stop
--    (transaction-local setting kdp.run_stop, like 0018) and changes only
--    stop_requested_at on a running run. The guard keeps user_id and
--    book_id equal to the section's owner and book (the service role
--    bypasses RLS).
-- 2. ai_usage.tokens_estimated: the output count (and the input count when
--    the AI never said it) is our estimate, not the AI's (Stop, disconnect,
--    timeout, failure).
-- 3. For the service role only (SECURITY INVOKER; execute revoked from
--    public, anon, authenticated):
--      section_run_begin   lock the section, check the base and the drafts,
--                          refuse a fresh running run (run_in_progress), save
--                          a stale run's text as a partial version (rule A: a
--                          server failure, not counted, its reserve released),
--                          create the usage row (failed, not counted,
--                          estimated, 0 tokens), claim the run.
--      section_run_beat    heartbeat, crash copy, token counts on the run and
--                          its usage row. Returns { running, stop }.
--      section_run_finish  one transaction: the version (base text + join +
--                          new text, source generate), current only when
--                          complete and the base is still current, Not
--                          started → Draft, Needs review when the positioning
--                          is no longer locked; the usage row; the run row.
--    None of these is an AI call or writes ai_usage rows beyond the one
--    created at the claim, so heartbeats and stops never count toward the
--    10 calls a minute (rule C).
-- 4. request_section_stop(run_id) for the user (SECURITY INVOKER, own running
--    run only): sets stop_requested_at. The run reads it on its next beat.
-- 5. section_has_writing (0019): a partial version counts only while it is
--    the current version (owner, E10.2 answer 2). The delete guard,
--    replace_outline, outline_json and unlock_positioning follow. This
--    changes the 0016 comment "a stopped generation keeps its partial text
--    as a version too": a partial the writer did not keep is not writing.
-- 6. md_word_count (0018): the marker "[Verify: no source]" is not words
--    (answer 7). kdpWords.count (js/word-budget.js) does the same.
-- 7. restore_version (0018): label "Kept partial text from vN" when the
--    restored version is partial ("Keep partial text"). The partial row
--    itself never changes.
--
-- Checked before writing (read-only): fill in at the owner's live check.
-- Expected: no section_runs table, no ai_usage.tokens_estimated; 0020 adds,
-- and only replaces section_has_writing, md_word_count, restore_version.

-- ---------------------------------------------------------------------------
-- 1. section_runs
-- ---------------------------------------------------------------------------
create table public.section_runs (
  section_id        uuid primary key references public.sections (id) on delete cascade,
  user_id           uuid not null references auth.users (id) on delete cascade,
  book_id           uuid not null references public.books (id) on delete cascade,
  run_id            uuid not null unique,
  usage_id          bigint references public.ai_usage (id) on delete set null,
  state             text not null check (state in ('running', 'ended')),
  end_reason        text check (end_reason in ('complete', 'user_stop', 'disconnect', 'timeout', 'max_tokens',
                                               'ai_error', 'refusal', 'too_long', 'shutdown', 'recovered', 'save_failed')),
  base_version_id   uuid references public.section_versions (id) on delete set null,
  version_id        uuid references public.section_versions (id) on delete set null,
  reserved_tokens   int not null default 0 check (reserved_tokens >= 0),
  content           text not null default '' check (char_length(content) <= 100000),
  input_tokens      int not null default 0 check (input_tokens >= 0),
  output_tokens     int not null default 0 check (output_tokens >= 0),
  tokens_estimated  boolean not null default true,
  started_at        timestamptz not null default now(),
  heartbeat_at      timestamptz not null default now(),
  stop_requested_at timestamptz,
  ended_at          timestamptz,
  constraint section_runs_ended_check check ((state = 'ended') = (ended_at is not null))
);

create index section_runs_user_id_idx on public.section_runs (user_id);
create index section_runs_book_id_idx on public.section_runs (book_id);
create index section_runs_usage_id_idx on public.section_runs (usage_id);
create index section_runs_base_version_id_idx on public.section_runs (base_version_id);
create index section_runs_version_id_idx on public.section_runs (version_id);

comment on table public.section_runs is
  'E10.2: the last Generate run per section (stage section_write). Written by the service role; the user can only request a stop.';

alter table public.section_runs enable row level security;

create policy "section_runs_select_own" on public.section_runs
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Only through request_section_stop (the guard checks the setting and the column).
create policy "section_runs_update_own" on public.section_runs
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke insert, delete, truncate on public.section_runs from anon, authenticated;

-- A run is fresh while its heartbeat is recent and it is younger than any wall clock.
create or replace function public.section_run_fresh(r public.section_runs)
returns boolean
language sql
stable
set search_path = ''
as $$
  select r.state = 'running'
     and r.heartbeat_at > now() - interval '20 seconds'
     and r.started_at > now() - interval '160 seconds';
$$;

comment on function public.section_run_fresh(public.section_runs) is
  'E10.2: a running run whose heartbeat is under 20 s old and that started under 160 s ago.';

create or replace function public.section_runs_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    -- Only request_section_stop, and only the stop time of a running run.
    if tg_op <> 'UPDATE'
       or coalesce(current_setting('kdp.run_stop', true), '') <> 'on'
       or old.state <> 'running'
       or (to_jsonb(new) - 'stop_requested_at') <> (to_jsonb(old) - 'stop_requested_at') then
      raise exception 'runs_server_only'
        using errcode = '42501',
              detail = 'Generate runs are written by the server. Use request_section_stop() to stop one.';
    end if;
    return new;
  end if;
  if not exists (select 1 from public.sections s join public.chapters c on c.id = s.chapter_id
                  where s.id = new.section_id and s.user_id = new.user_id and c.book_id = new.book_id) then
    raise exception 'run_owner'
      using errcode = 'P0001',
            detail = 'A run belongs to the owner and the book of its section.';
  end if;
  return new;
end;
$$;

comment on function public.section_runs_guard() is
  'Trigger (E10.2): users only set stop_requested_at through request_section_stop (42501 "runs_server_only"); user_id and book_id match the section (P0001 "run_owner").';

create trigger section_runs_guard
  before insert or update on public.section_runs
  for each row execute function public.section_runs_guard();

revoke execute on function public.section_runs_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. ai_usage.tokens_estimated
-- ---------------------------------------------------------------------------
alter table public.ai_usage
  add column tokens_estimated boolean not null default false;

comment on column public.ai_usage.tokens_estimated is
  'E10.2: true when the counts are our estimate (Stop, disconnect, timeout, failure), not the AI''s.';

-- ---------------------------------------------------------------------------
-- 6. md_word_count: the marker is not words (0018 rule otherwise)
-- ---------------------------------------------------------------------------
create or replace function public.md_word_count(t text)
returns int
language sql
immutable
set search_path = ''
as $$
  select count(*)::int
    from regexp_split_to_table(
           replace(regexp_replace(replace(coalesce(t, ''), '[Verify: no source]', ' '),
                                  '^[ \t]*(#{1,6}|[-+]|[0-9]{1,9}[.)])[ \t]+', '', 'gn'), '*', ''),
           '[ \t\n\r\f\v]+') w
   where w <> '';
$$;

comment on function public.md_word_count(text) is
  'E10.1, E10.2: words in a section''s Markdown text; "[Verify: no source]" is not words. Same rule as kdpWords.count (js/word-budget.js).';

-- ---------------------------------------------------------------------------
-- 5. section_has_writing: a partial counts only while current
-- ---------------------------------------------------------------------------
create or replace function public.section_has_writing(p_section_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from public.section_versions v
                   join public.sections s on s.id = v.section_id
                  where v.section_id = p_section_id
                    and not public.text_is_blank(v.content)
                    and (not v.partial or v.id = s.current_version_id))
      or exists (select 1 from public.section_drafts d
                  where d.section_id = p_section_id and not public.text_is_blank(d.content));
$$;

comment on function public.section_has_writing(uuid) is
  'E10.1, 0019, 0020: a section has writing when it has a version or a draft with text. A partial version counts only while it is current.';

-- ---------------------------------------------------------------------------
-- 7. restore_version: "Kept partial text from vN"
-- ---------------------------------------------------------------------------
create or replace function public.restore_version(p_section_id uuid, p_version_id uuid, p_base_version_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current uuid := public.write_lock_section(p_section_id);
  v_old     public.section_versions;
  v_cur     text;
  v_draft   text;
  v_row     public.section_versions;
  v_new     int;
begin
  if v_current is distinct from p_base_version_id then
    raise exception 'version_conflict'
      using errcode = 'P0001',
            detail = 'This section was saved in another tab.';
  end if;

  select * into v_old from public.section_versions v
   where v.id = p_version_id and v.section_id = p_section_id;
  if not found then
    raise exception 'version_not_found'
      using errcode = 'P0002',
            detail = 'This version does not exist in this section.';
  end if;

  -- Typed text is never lost: the browser saves the draft first.
  select v.content into v_cur from public.section_versions v where v.id = v_current;
  select d.content into v_draft from public.section_drafts d where d.section_id = p_section_id;
  if v_draft is not null and v_draft is distinct from coalesce(v_cur, '') then
    raise exception 'unsaved_draft'
      using errcode = 'P0001',
            detail = 'Save the text you typed before you restore.';
  end if;
  delete from public.section_drafts d where d.section_id = p_section_id;

  v_new := public.write_next_version(p_section_id, v_old.content);
  perform set_config('kdp.version_write', 'on', true);
  insert into public.section_versions (user_id, section_id, version_no, content, source, label)
  select s.user_id, s.id, v_new, v_old.content, 'restore',
         case when v_old.partial then 'Kept partial text from v' else 'Restored from v' end || v_old.version_no
    from public.sections s where s.id = p_section_id
  returning * into v_row;
  update public.sections
     set current_version_id = v_row.id,
         status = case when status = 'not_started' then 'draft' else status end
   where id = p_section_id;
  perform set_config('kdp.version_write', '', true);
  return jsonb_build_object('id', v_row.id, 'version_no', v_row.version_no, 'word_count', v_row.word_count,
                            'created_at', v_row.created_at, 'created', true);
end;
$$;

comment on function public.restore_version(uuid, uuid, uuid) is
  'E10.1, 0020: restore an older version as a new current ''restore'' version ("Kept partial text from vN" for a partial one). Nothing is overwritten. Raises P0001 version_conflict, unsaved_draft; P0002 section_not_found, version_not_found.';

revoke execute on function public.restore_version(uuid, uuid, uuid) from public, anon;
grant execute on function public.restore_version(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The server's run RPCs (service role only)
-- ---------------------------------------------------------------------------
-- Base text + new text: a blank line, or a space when the base ends in the
-- middle of a sentence (a kept partial).
create or replace function public.write_join(p_base text, p_add text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_base text := rtrim(coalesce(p_base, ''), E' \t\n\r');
  v_add  text := btrim(coalesce(p_add, ''), E' \t\n\r');
  v_last text;
begin
  if public.text_is_blank(v_base) then return v_add; end if;
  if public.text_is_blank(v_add) then return coalesce(p_base, ''); end if;
  v_last := substring(v_base from E'[^\\n]*$');
  -- A finished sentence, a heading or a list item: a new paragraph.
  if v_last ~ E'[.!?:"”’)\\]]$' or v_last ~ E'^(#{1,6} |- |[0-9]{1,9}[.)] )' then
    return v_base || E'\n\n' || v_add;
  end if;
  -- Mid-sentence (a kept partial): the new text goes on the same line.
  return v_base || ' ' || v_add;
end;
$$;

comment on function public.write_join(text, text) is
  'E10.2: a section''s text plus generated text: a blank line between, or a space when the text ends mid-sentence.';

-- Saves a stale run's crash copy as a partial version and ends it (rule A:
-- a server failure, not counted). Returns the version number or null.
create or replace function public.section_run_recover(p_section_id uuid)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r      public.section_runs;
  v_base text;
  v_text text;
  v_no   int;
  v_id   uuid;
begin
  select * into r from public.section_runs where section_id = p_section_id and state = 'running' for update;
  if not found then
    return null;
  end if;
  if not public.text_is_blank(r.content) then
    select v.content into v_base from public.section_versions v where v.id = r.base_version_id;
    v_text := left(public.write_join(coalesce(v_base, ''), r.content), 100000);
    select coalesce(max(v.version_no), 0) + 1 into v_no from public.section_versions v where v.section_id = p_section_id;
    insert into public.section_versions (user_id, section_id, version_no, content, source, label, partial)
    values (r.user_id, p_section_id, v_no, v_text, 'generate',
            case when public.text_is_blank(v_base) then null else 'Continued' end, true)
    returning id into v_id;
  end if;
  update public.ai_usage
     set status = 'failed', counted = false, tokens_estimated = true,
         input_tokens = r.input_tokens, output_tokens = r.output_tokens
   where id = r.usage_id;
  update public.section_runs
     set state = 'ended', end_reason = 'recovered', version_id = v_id, content = '', ended_at = now()
   where section_id = p_section_id;
  return v_no;
end;
$$;

create or replace function public.section_run_begin(p_user_id uuid, p_book_id uuid, p_section_id uuid, p_run_id uuid,
                                                    p_base_version_id uuid, p_reserved int, p_model text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current   uuid;
  v_cur_text  text;
  v_draft     text;
  r           public.section_runs;
  v_recovered int;
  v_usage     bigint;
begin
  select s.current_version_id into v_current
    from public.sections s
    join public.chapters c on c.id = s.chapter_id
   where s.id = p_section_id and s.user_id = p_user_id and c.book_id = p_book_id
     for update of s;
  if not found then
    raise exception 'section_not_found'
      using errcode = 'P0002',
            detail = 'This section does not exist, or it belongs to another account.';
  end if;

  if v_current is distinct from p_base_version_id then
    raise exception 'version_conflict'
      using errcode = 'P0001',
            detail = 'This section was saved in another tab.';
  end if;

  select v.content into v_cur_text from public.section_versions v where v.id = v_current;
  select d.content into v_draft from public.section_drafts d where d.section_id = p_section_id;
  if not public.text_is_blank(v_draft) and v_draft is distinct from coalesce(v_cur_text, '') then
    raise exception 'unsaved_draft'
      using errcode = 'P0001',
            detail = 'Save the text you typed first.';
  end if;

  select * into r from public.section_runs where section_id = p_section_id for update;
  if found and public.section_run_fresh(r) then
    raise exception 'run_in_progress'
      using errcode = 'P0001',
            detail = 'This section is being written in another tab or window.';
  end if;
  if found and r.state = 'running' then
    v_recovered := public.section_run_recover(p_section_id);
  end if;

  insert into public.ai_usage (user_id, book_id, stage, model, input_tokens, output_tokens, status, counted, tokens_estimated)
  values (p_user_id, p_book_id, 'section_write', p_model, 0, 0, 'failed', false, true)
  returning id into v_usage;

  insert into public.section_runs (section_id, user_id, book_id, run_id, usage_id, state, end_reason, base_version_id,
                                   version_id, reserved_tokens, content, input_tokens, output_tokens, tokens_estimated,
                                   started_at, heartbeat_at, stop_requested_at, ended_at)
  values (p_section_id, p_user_id, p_book_id, p_run_id, v_usage, 'running', null, p_base_version_id,
          null, greatest(p_reserved, 0), '', 0, 0, true, now(), now(), null, null)
  on conflict (section_id) do update
     set user_id = excluded.user_id, book_id = excluded.book_id, run_id = excluded.run_id, usage_id = excluded.usage_id,
         state = 'running', end_reason = null, base_version_id = excluded.base_version_id, version_id = null,
         reserved_tokens = excluded.reserved_tokens, content = '', input_tokens = 0, output_tokens = 0,
         tokens_estimated = true, started_at = now(), heartbeat_at = now(), stop_requested_at = null, ended_at = null;

  return jsonb_build_object('usage_id', v_usage, 'recovered', v_recovered);
end;
$$;

comment on function public.section_run_begin(uuid, uuid, uuid, uuid, uuid, int, text) is
  'E10.2 (service role): claim a section for a Generate run. Raises P0002 section_not_found; P0001 version_conflict, unsaved_draft, run_in_progress. A stale run''s text is saved first as a partial version (not counted).';

create or replace function public.section_run_beat(p_run_id uuid, p_content text, p_input int, p_output int)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.section_runs;
begin
  update public.section_runs
     set content = left(coalesce(p_content, ''), 100000), heartbeat_at = now(),
         input_tokens = greatest(p_input, 0), output_tokens = greatest(p_output, 0)
   where run_id = p_run_id and state = 'running'
  returning * into r;
  if not found then
    return jsonb_build_object('running', false, 'stop', true);
  end if;
  update public.ai_usage
     set input_tokens = r.input_tokens, output_tokens = r.output_tokens
   where id = r.usage_id;
  return jsonb_build_object('running', true, 'stop', r.stop_requested_at is not null);
end;
$$;

comment on function public.section_run_beat(uuid, text, int, int) is
  'E10.2 (service role): heartbeat and crash copy of a running run. Returns { running, stop }; running false = the run was taken over.';

create or replace function public.section_run_finish(p_run_id uuid, p_text text, p_partial boolean, p_end_reason text,
                                                     p_status text, p_counted boolean, p_input int, p_output int,
                                                     p_estimated boolean)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r          public.section_runs;
  v_current  uuid;
  v_base     text;
  v_text     text;
  v_partial  boolean := coalesce(p_partial, true);
  v_make     boolean := false;
  v_row      public.section_versions;
  v_no       int;
begin
  select * into r from public.section_runs where run_id = p_run_id for update;
  if not found or r.state <> 'running' then
    raise exception 'run_not_running'
      using errcode = 'P0001',
            detail = 'This run was ended or taken over.';
  end if;

  select s.current_version_id into v_current from public.sections s where s.id = r.section_id for update;

  if not public.text_is_blank(p_text) then
    select v.content into v_base from public.section_versions v where v.id = r.base_version_id;
    v_text := public.write_join(coalesce(v_base, ''), p_text);
    if char_length(v_text) > 100000 then
      v_text := left(v_text, 100000);
      v_partial := true;
    end if;
    v_make := not v_partial and v_current is not distinct from r.base_version_id;
    select coalesce(max(v.version_no), 0) + 1 into v_no from public.section_versions v where v.section_id = r.section_id;
    insert into public.section_versions (user_id, section_id, version_no, content, source, label, partial)
    values (r.user_id, r.section_id, v_no, v_text, 'generate',
            case when public.text_is_blank(v_base) then null else 'Continued' end, v_partial)
    returning * into v_row;
    if v_make then
      update public.sections
         set current_version_id = v_row.id,
             status = case when status = 'not_started' then 'draft' else status end,
             needs_review = needs_review or not exists (
               select 1 from public.positioning p join public.chapters c on c.book_id = p.book_id
                where c.id = sections.chapter_id and p.locked_at is not null)
       where id = r.section_id;
      -- A blank draft (typed and deleted) would look like a conflict on the next open.
      delete from public.section_drafts d where d.section_id = r.section_id and public.text_is_blank(d.content);
    end if;
  end if;

  update public.ai_usage
     set input_tokens = greatest(p_input, 0), output_tokens = greatest(p_output, 0),
         status = p_status, counted = p_counted, tokens_estimated = p_estimated
   where id = r.usage_id;

  update public.section_runs
     set state = 'ended', end_reason = p_end_reason, version_id = v_row.id, content = '', ended_at = now(),
         input_tokens = greatest(p_input, 0), output_tokens = greatest(p_output, 0), tokens_estimated = p_estimated
   where run_id = p_run_id;

  return jsonb_build_object(
    'version_id', v_row.id, 'version_no', v_row.version_no, 'word_count', v_row.word_count,
    'current', v_make, 'partial', v_row.id is not null and v_row.partial,
    'conflict', v_row.id is not null and not v_partial and not v_make);
end;
$$;

comment on function public.section_run_finish(uuid, text, boolean, text, text, boolean, int, int, boolean) is
  'E10.2 (service role): end a run in one transaction: the generated version (current only when complete and the base is still current), the usage row, the run row. Raises P0001 run_not_running.';

-- Server only: the generate function calls these with the service role.
revoke execute on function public.section_run_fresh(public.section_runs) from public, anon, authenticated;
revoke execute on function public.write_join(text, text) from public, anon, authenticated;
revoke execute on function public.section_run_recover(uuid) from public, anon, authenticated;
revoke execute on function public.section_run_begin(uuid, uuid, uuid, uuid, uuid, int, text) from public, anon, authenticated;
revoke execute on function public.section_run_beat(uuid, text, int, int) from public, anon, authenticated;
revoke execute on function public.section_run_finish(uuid, text, boolean, text, text, boolean, int, int, boolean) from public, anon, authenticated;
grant execute on function public.section_run_fresh(public.section_runs) to service_role;
grant execute on function public.write_join(text, text) to service_role;
grant execute on function public.section_run_recover(uuid) to service_role;
grant execute on function public.section_run_begin(uuid, uuid, uuid, uuid, uuid, int, text) to service_role;
grant execute on function public.section_run_beat(uuid, text, int, int) to service_role;
grant execute on function public.section_run_finish(uuid, text, boolean, text, text, boolean, int, int, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 4. request_section_stop (the Stop button)
-- ---------------------------------------------------------------------------
create or replace function public.request_section_stop(p_run_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rows int;
begin
  -- Transaction-local: lets the guard accept this one change.
  perform set_config('kdp.run_stop', 'on', true);
  update public.section_runs
     set stop_requested_at = coalesce(stop_requested_at, now())
   where run_id = p_run_id and state = 'running';
  get diagnostics v_rows = row_count;
  perform set_config('kdp.run_stop', '', true);
  return v_rows > 0;
end;
$$;

comment on function public.request_section_stop(uuid) is
  'E10.2: ask a running Generate run of the caller''s to stop. true when it was running. Not an AI call.';

revoke execute on function public.request_section_stop(uuid) from public, anon;
grant execute on function public.request_section_stop(uuid) to authenticated;
