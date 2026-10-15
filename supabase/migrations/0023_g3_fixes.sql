-- 0023_g3_fixes.sql
-- KDP Lab · PRODUCE gate G3 (P4). Replaces only the function named below.
-- Same signature, search_path = '' and grants as before. No table, column,
-- policy or data change.
--
-- 3. section_finding_ok (0022): a finding may also carry "unsourced", the
--    numbers in its message with no source (P4, the 0017 rule): an array of
--    1 to 10 strings of 1 to 20 characters. Findings without it (every row
--    saved so far) still pass. The table check is unchanged.
--
-- Checked before writing (read-only): fill in at the owner's apply.
-- Expected: last migration 0022.

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
