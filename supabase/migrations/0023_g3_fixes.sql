-- 0023_g3_fixes.sql
-- KDP Lab · PRODUCE gate G3 (P4, P5). Replaces only the functions named below.
-- Same signatures, SECURITY INVOKER (the default), search_path = '' and grants
-- as before. No table, column, policy or data change.
--
-- 1. write_cut(text, int) (new, service role only, like write_join): the text
--    cut to at most p_max characters, never inside a word or a
--    "[Verify: no source]" marker (P5). Same rule as cutText in
--    supabase/functions/generate/lib/section_write.ts:
--      a. at most p_max characters: unchanged;
--      b. cut at p_max; inside a word (no whitespace on either side of the
--         cut), back to the last whitespace (space, tab, line breaks, form
--         feed, vertical tab: the md_word_count set); with no whitespace at
--         all, the hard cut stays;
--      c. a marker that spans the cut: back to its start;
--      d. trailing whitespace trimmed.
-- 2. section_run_recover and section_run_finish (0020): left(..., 100000)
--    becomes write_cut(..., 100000). Nothing else changes.
--    section_run_beat keeps left(): it stores the raw crash copy, which
--    section_run_recover cuts when it saves it.
-- 3. section_finding_ok (0022): a finding may also carry "unsourced", the
--    numbers in its message with no source (P4, the 0017 rule): an array of
--    1 to 10 strings of 1 to 20 characters. Findings without it (every row
--    saved so far) still pass. The table check is unchanged.
--
-- Checked before writing (read-only): fill in at the owner's apply.
-- Expected: last migration 0022, no function public.write_cut.

-- ---------------------------------------------------------------------------
-- 1. write_cut
-- ---------------------------------------------------------------------------
create or replace function public.write_cut(p_text text, p_max int)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  -- chr(11) is \v (an E'' string has no \v escape).
  c_ws     constant text := E' \t\n\r\f' || chr(11);
  c_marker constant text := '[Verify: no source]';
  v_at     int := p_max;   -- characters kept
  v_head   text;
  v_from   int;
  v_j      int;
begin
  if p_text is null or char_length(p_text) <= p_max then
    return p_text;
  end if;
  -- b. Inside a word: back to the last whitespace before the cut.
  if position(substr(p_text, p_max, 1) in c_ws) = 0 and position(substr(p_text, p_max + 1, 1) in c_ws) = 0 then
    -- A plain string: the regex itself reads \t \n \r \f \v (as md_word_count).
    v_head := substring(left(p_text, p_max) from '^(.*[ \t\n\r\f\v])');
    if v_head is not null then
      v_at := char_length(v_head) - 1;
    end if;
  end if;
  -- c. A marker that spans the cut starts at most 18 characters before it;
  -- a 36-character window holds at most one whole marker (19 characters).
  v_from := greatest(1, v_at - char_length(c_marker) + 2);
  v_j := position(c_marker in substr(p_text, v_from, 2 * char_length(c_marker) - 2));
  if v_j > 0 and v_from + v_j - 1 <= v_at and v_from + v_j - 1 + char_length(c_marker) - 1 > v_at then
    v_at := v_from + v_j - 2;
  end if;
  -- d.
  return rtrim(left(p_text, v_at), c_ws);
end;
$$;

comment on function public.write_cut(text, int) is
  'G3 P5 (service role): the text cut to at most p_max characters, never inside a word or a "[Verify: no source]" marker, trailing whitespace trimmed. Same rule as cutText (generate lib/section_write.ts).';

-- ---------------------------------------------------------------------------
-- 2. section_run_recover and section_run_finish (0020, only the cut changes)
-- ---------------------------------------------------------------------------
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
    v_text := public.write_cut(public.write_join(coalesce(v_base, ''), r.content), 100000);
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
  v_section  uuid;
  v_capped   boolean := false;
begin
  -- Lock order: the section row first, then the run row, the same as
  -- section_run_begin (and its stale takeover), so the two cannot deadlock.
  select x.section_id into v_section from public.section_runs x where x.run_id = p_run_id;
  if found then
    select s.current_version_id into v_current from public.sections s where s.id = v_section for update;
    select * into r from public.section_runs where run_id = p_run_id for update;
  end if;
  -- Rechecked under the locks: a takeover may have ended or replaced the run meanwhile.
  if r.run_id is null or r.state <> 'running' or r.section_id is distinct from v_section then
    raise exception 'run_not_running'
      using errcode = 'P0001',
            detail = 'This run was ended or taken over.';
  end if;

  if not public.text_is_blank(p_text) then
    select v.content into v_base from public.section_versions v where v.id = r.base_version_id;
    v_text := public.write_join(coalesce(v_base, ''), p_text);
    if char_length(v_text) > 100000 then
      v_text := public.write_cut(v_text, 100000);
      v_partial := true;
      v_capped := true;
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
    'conflict', v_row.id is not null and not v_partial and not v_make,
    'capped', v_capped);
end;
$$;

comment on function public.section_run_finish(uuid, text, boolean, text, text, boolean, int, int, boolean) is
  'E10.2, G3 (service role): end a run in one transaction: the generated version (current only when complete and the base is still current; capped = cut at 100,000 characters by write_cut, never inside a word or a marker), the usage row, the run row. Locks the section, then the run (as begin). Raises P0001 run_not_running.';

-- Server only: the generate function calls these with the service role.
revoke execute on function public.write_cut(text, int) from public, anon, authenticated;
revoke execute on function public.section_run_recover(uuid) from public, anon, authenticated;
revoke execute on function public.section_run_finish(uuid, text, boolean, text, text, boolean, int, int, boolean) from public, anon, authenticated;
grant execute on function public.write_cut(text, int) to service_role;
grant execute on function public.section_run_recover(uuid) to service_role;
grant execute on function public.section_run_finish(uuid, text, boolean, text, text, boolean, int, int, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 3. section_finding_ok: an optional "unsourced" list (P4)
-- ---------------------------------------------------------------------------
create or replace function public.section_finding_ok(e jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- case, not "and": SQL does not promise left-to-right order, and the
  -- jsonb functions raise an error on the wrong type.
  select case
    when jsonb_typeof(e) is distinct from 'object' then false
    when (select array_agg(k order by k) from jsonb_object_keys(e) k)
         is distinct from array['message', 'quote', 'type']
     and (select array_agg(k order by k) from jsonb_object_keys(e) k)
         is distinct from array['message', 'quote', 'type', 'unsourced'] then false
    when jsonb_typeof(e -> 'type') <> 'string'
      or jsonb_typeof(e -> 'message') <> 'string'
      or jsonb_typeof(e -> 'quote') <> 'string' then false
    when e ->> 'type' not in ('objective', 'voice', 'drift') then false
    when char_length(e ->> 'message') > 300 or public.text_is_blank(e ->> 'message') then false
    when char_length(e ->> 'quote') > 300 then false
    -- unsourced (G3 P4): 1 to 10 numbers of 1 to 20 characters (0017 rule).
    when e ? 'unsourced' and jsonb_typeof(e -> 'unsourced') <> 'array' then false
    when e ? 'unsourced' and jsonb_array_length(e -> 'unsourced') not between 1 and 10 then false
    when e ? 'unsourced' and exists (select 1 from jsonb_array_elements(e -> 'unsourced') u
                                      where case when jsonb_typeof(u) <> 'string' then true
                                                 else char_length(u #>> '{}') not between 1 and 20 end) then false
    -- An empty quote: an objective gap only (decision 1).
    when e ->> 'quote' = '' then e ->> 'type' = 'objective'
    else not public.text_is_blank(e ->> 'quote')
  end;
$$;

comment on function public.section_finding_ok(jsonb) is
  'Structure check for one AI section finding: { type objective|voice|drift, message, quote [, unsourced] } (an empty quote only for objective; unsourced: 1 to 10 numbers of 1 to 20 characters, G3).';
