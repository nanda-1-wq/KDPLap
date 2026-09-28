-- 0005_pen_name_rules.sql
-- KDP Lab · E5 · Pen name rules.
--
-- 1. A pen name is 1 to 100 characters after trim. The 0001 check allowed
--    a name of only spaces.
-- 2. bio_facts and voice keep their JSON shape. The database checks
--    STRUCTURE only: an object, known keys, value types, max lengths, and
--    at most 6 tones. Allowed values (tone words, reading levels,
--    perspectives) live in the browser (js/pen-name-common.js), so adding a
--    value later needs no migration.
-- 3. create_book starts a new book with the user's default pen name
--    (user_settings.default_pen_name_id), or null if none is set.
--
-- Shapes (a missing key reads as empty):
--   bio_facts = { "background": text <= 1000, "credentials": text <= 300,
--                 "personal": text <= 500 }
--   voice     = { "tones": [text <= 40, ...] (at most 6),
--                 "reading_level" | "perspective" | "sentences" | "paragraphs":
--                   text <= 40 or null,
--                 "sample": text <= 10000 }
--
-- Checked before writing (read-only): public.pen_names has 0 rows, so no
-- existing row fails a check.

-- ---------------------------------------------------------------------------
-- 1. Name length
-- ---------------------------------------------------------------------------
alter table public.pen_names
  add constraint pen_names_name_trim_length_check
  check (char_length(btrim(name)) between 1 and 100);

-- ---------------------------------------------------------------------------
-- 2. JSON structure
-- ---------------------------------------------------------------------------
create or replace function public.pen_name_bio_facts_ok(j jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- case, not "and": SQL does not promise left-to-right order, and
  -- jsonb_object_keys raises an error on a non-object.
  select case when jsonb_typeof(j) is distinct from 'object' then false else (
         not exists (
           select 1 from jsonb_object_keys(j) k
            where k not in ('background', 'credentials', 'personal'))
     and (not j ? 'background'  or (jsonb_typeof(j -> 'background')  = 'string' and char_length(j ->> 'background')  <= 1000))
     and (not j ? 'credentials' or (jsonb_typeof(j -> 'credentials') = 'string' and char_length(j ->> 'credentials') <= 300))
     and (not j ? 'personal'    or (jsonb_typeof(j -> 'personal')    = 'string' and char_length(j ->> 'personal')    <= 500))
  ) end;
$$;

create or replace function public.pen_name_voice_ok(j jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(j) is distinct from 'object' then false else (
         not exists (
           select 1 from jsonb_object_keys(j) k
            where k not in ('tones', 'reading_level', 'perspective', 'sentences', 'paragraphs', 'sample'))
     -- tones: an array of at most 6 short strings
     and (case when not j ? 'tones' then true
               when jsonb_typeof(j -> 'tones') <> 'array' then false
               else jsonb_array_length(j -> 'tones') <= 6
                and not exists (
                      select 1 from jsonb_array_elements(j -> 'tones') t
                       where jsonb_typeof(t) <> 'string' or char_length(t #>> '{}') > 40)
          end)
     -- single choices: a short string or null
     and not exists (
           select 1 from unnest(array['reading_level', 'perspective', 'sentences', 'paragraphs']) f
            where j ? f
              and jsonb_typeof(j -> f) <> 'null'
              and (jsonb_typeof(j -> f) <> 'string' or char_length(j ->> f) > 40))
     -- writing sample
     and (not j ? 'sample' or (jsonb_typeof(j -> 'sample') = 'string' and char_length(j ->> 'sample') <= 10000))
  ) end;
$$;

comment on function public.pen_name_bio_facts_ok(jsonb) is
  'Structure check for pen_names.bio_facts. Allowed values live in the browser.';
comment on function public.pen_name_voice_ok(jsonb) is
  'Structure check for pen_names.voice. Allowed values live in the browser.';

alter table public.pen_names
  add constraint pen_names_bio_facts_shape_check
  check (public.pen_name_bio_facts_ok(bio_facts));

alter table public.pen_names
  add constraint pen_names_voice_shape_check
  check (public.pen_name_voice_ok(voice));

-- ---------------------------------------------------------------------------
-- 3. create_book uses the default pen name
-- ---------------------------------------------------------------------------
-- Same as 0002, plus v_pen_name_id. The default is always the user's own:
-- the user_settings policies (0001) check it, and books_insert_own checks
-- it again on insert.
create or replace function public.create_book(
  p_topic_id   uuid default null,
  p_topic_text text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id     uuid := auth.uid();
  v_topic_name  text;
  v_topic_text  text;
  v_trim        text;
  v_pen_name_id uuid;
  v_book_id     uuid;
begin
  if v_user_id is null then
    raise exception 'Sign in to create a book.'
      using errcode = '42501';
  end if;

  -- A validated topic, if given, must be the user's own. The row lock stops
  -- two quick requests from starting two books from the same topic.
  if p_topic_id is not null then
    select t.name
      into v_topic_name
      from public.topics t
     where t.id = p_topic_id
       and t.user_id = v_user_id
       and t.status = 'validated'
       for update;

    if not found then
      raise exception 'Topic is not one of your validated topics.'
        using errcode = '42501';
    end if;
  end if;

  -- Topic text: the given text, else the topic name. 1 to 200 characters.
  v_topic_text := btrim(coalesce(p_topic_text, v_topic_name, ''));
  if char_length(v_topic_text) < 1 or char_length(v_topic_text) > 200 then
    raise exception 'Topic must be 1 to 200 characters.'
      using errcode = '22023';
  end if;

  -- Trim size lives in the Brief (one source of truth); start from the user's default.
  -- The pen name starts from the user's default too (null if none).
  select s.default_trim, s.default_pen_name_id
    into v_trim, v_pen_name_id
    from public.user_settings s
   where s.user_id = v_user_id;

  insert into public.books (user_id, topic_id, pen_name_id)
  values (v_user_id, p_topic_id, v_pen_name_id)
  returning id into v_book_id;

  insert into public.book_briefs (book_id, user_id, topic_text, trim_size)
  values (v_book_id, v_user_id, v_topic_text, coalesce(v_trim, '6x9'));

  if p_topic_id is not null then
    update public.topics
       set status = 'book_started'
     where id = p_topic_id
       and user_id = v_user_id;
  end if;

  return v_book_id;
end;
$$;

comment on function public.create_book(uuid, text) is
  'Creates a book and its Brief for the signed-in user. Optional validated topic is marked book_started. Starts with the default pen name.';

-- create or replace keeps the grants from 0002; repeat them so this file stands alone.
revoke execute on function public.create_book(uuid, text) from public, anon;
grant  execute on function public.create_book(uuid, text) to authenticated;
