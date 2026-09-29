-- 0006_topic_import.sql
-- KDP Lab · E6.5 · Import from Amazon page.
--
-- 1. Each count on a topic (winning, low-traction, authority) records where it
--    came from ('manual' or 'imported') and when. A trigger sets both, so the
--    browser never writes them. Only save_topic_import can write 'imported'.
-- 2. topic_page_books: the page-1 books saved with an import.
-- 3. save_topic_import: saves the books and the imported counts in one
--    transaction. The counts are computed here from the included books.
--
-- The UI now says "Low-traction books". The column keeps its name dead_count,
-- because checks_passed (0001) and every query read it.
--
-- Checked before writing (read-only): public.topics has 1 row, and it has
-- counts. The backfill marks its set counts 'manual', dated at its updated_at.
-- No table or function named below exists yet.

-- ---------------------------------------------------------------------------
-- 1. Count source and date
-- ---------------------------------------------------------------------------
alter table public.topics
  add column winning_source   text check (winning_source   in ('manual', 'imported')),
  add column winning_set_at   timestamptz,
  add column dead_source      text check (dead_source      in ('manual', 'imported')),
  add column dead_set_at      timestamptz,
  add column authority_source text check (authority_source in ('manual', 'imported')),
  add column authority_set_at timestamptz;

-- Backfill existing counts as manual. The updated_at trigger is off for this
-- one statement, so Topic Lab keeps its order.
alter table public.topics disable trigger topics_set_updated_at;

update public.topics
   set winning_source   = case when winning_count   is not null then 'manual' end,
       winning_set_at   = case when winning_count   is not null then updated_at end,
       dead_source      = case when dead_count      is not null then 'manual' end,
       dead_set_at      = case when dead_count      is not null then updated_at end,
       authority_source = case when authority_count is not null then 'manual' end,
       authority_set_at = case when authority_count is not null then updated_at end;

alter table public.topics enable trigger topics_set_updated_at;

-- A count has a source and a date exactly when it is set.
alter table public.topics
  add constraint topics_count_source_check check (
        (winning_count   is null) = (winning_source   is null)
    and (winning_source  is null) = (winning_set_at   is null)
    and (dead_count      is null) = (dead_source      is null)
    and (dead_source     is null) = (dead_set_at      is null)
    and (authority_count is null) = (authority_source is null)
    and (authority_source is null) = (authority_set_at is null)
  );

-- The trigger owns the source columns.
-- Outside an import: a count that changes becomes 'manual' with now(); a
-- cleared count loses its source; any other write to a source or date is
-- undone. Inside save_topic_import (the transaction-local setting
-- kdp.topic_import is 'on') the function's values are kept. The browser
-- cannot set that value: set_config is not exposed through the API.
create or replace function public.topics_count_source()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(current_setting('kdp.topic_import', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.winning_source   := case when new.winning_count   is not null then 'manual' end;
    new.winning_set_at   := case when new.winning_count   is not null then now() end;
    new.dead_source      := case when new.dead_count      is not null then 'manual' end;
    new.dead_set_at      := case when new.dead_count      is not null then now() end;
    new.authority_source := case when new.authority_count is not null then 'manual' end;
    new.authority_set_at := case when new.authority_count is not null then now() end;
    return new;
  end if;

  if new.winning_count is distinct from old.winning_count then
    new.winning_source := case when new.winning_count is not null then 'manual' end;
    new.winning_set_at := case when new.winning_count is not null then now() end;
  else
    new.winning_source := old.winning_source;
    new.winning_set_at := old.winning_set_at;
  end if;

  if new.dead_count is distinct from old.dead_count then
    new.dead_source := case when new.dead_count is not null then 'manual' end;
    new.dead_set_at := case when new.dead_count is not null then now() end;
  else
    new.dead_source := old.dead_source;
    new.dead_set_at := old.dead_set_at;
  end if;

  if new.authority_count is distinct from old.authority_count then
    new.authority_source := case when new.authority_count is not null then 'manual' end;
    new.authority_set_at := case when new.authority_count is not null then now() end;
  else
    new.authority_source := old.authority_source;
    new.authority_set_at := old.authority_set_at;
  end if;

  return new;
end;
$$;

comment on function public.topics_count_source() is
  'Sets winning/dead/authority source and date. Manual on any edit; imported only inside save_topic_import.';

create trigger topics_count_source
  before insert or update on public.topics
  for each row execute function public.topics_count_source();

revoke execute on function public.topics_count_source() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Page-1 books of a topic
-- ---------------------------------------------------------------------------
create table public.topic_page_books (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  topic_id    uuid not null references public.topics (id) on delete cascade,
  position    smallint not null check (position between 1 and 100),
  title       text not null check (char_length(btrim(title)) between 1 and 300),
  author      text check (char_length(author) <= 200),
  bsr         int check (bsr between 1 and 100000000),
  reviews     int check (reviews between 0 and 10000000),
  rating      numeric(2,1) check (rating between 0 and 5),
  sponsored   boolean not null default false,
  included    boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (topic_id, position)
);

create index topic_page_books_user_id_idx on public.topic_page_books (user_id);

alter table public.topic_page_books enable row level security;

create policy "topic_page_books_select_own" on public.topic_page_books
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "topic_page_books_insert_own" on public.topic_page_books
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.topics t
                where t.id = topic_id and t.user_id = (select auth.uid()))
  );

create policy "topic_page_books_update_own" on public.topic_page_books
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.topics t
                where t.id = topic_id and t.user_id = (select auth.uid()))
  );

create policy "topic_page_books_delete_own" on public.topic_page_books
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. Save an import (one transaction)
-- ---------------------------------------------------------------------------
-- Called as rpc('save_topic_import', { p_topic_id, p_books, p_replace_manual }).
-- p_books: 1 to 100 objects with exactly the keys
--   title (text), author (text|null), bsr (int|null), reviews (int|null),
--   rating (number|null), sponsored (bool), included (bool)
-- in page order. The old page-1 books are replaced.
--
-- Counts (same rules as js/topics.js RULES; pass marks as in 0001):
--   winning:       BSR <= 30,000  and reviews <= 250   (needs BSR and reviews)
--   low-traction:  BSR >= 150,000 and reviews >= 30    (needs BSR and reviews)
--   authority:     reviews >= 500                      (BSR does not matter)
-- Only included books count. A missing number never matches a rule.
--
-- Imported counts are always replaced. A manual count is replaced only when
-- p_replace_manual is true. Status follows the Topic detail rules: idea goes
-- to researching; validated goes to researching below 5 of 5.
--
-- SECURITY INVOKER: Row Level Security applies to every read and write.
create or replace function public.save_topic_import(
  p_topic_id       uuid,
  p_books          jsonb,
  p_replace_manual boolean default false
)
returns public.topics
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id   uuid := auth.uid();
  v_topic     public.topics;
  v_book      jsonb;
  v_pos       int;
  v_winning   int;
  v_dead      int;
  v_authority int;
  v_w         int;
  v_d         int;
  v_a         int;
  v_keep_w    boolean;
  v_keep_d    boolean;
  v_keep_a    boolean;
  v_passed    int;
  v_status    text;
  v_row       public.topics;
begin
  if v_user_id is null then
    raise exception 'Sign in to import.' using errcode = '42501';
  end if;

  select * into v_topic
    from public.topics t
   where t.id = p_topic_id
     and t.user_id = v_user_id
     for update;
  if not found then
    raise exception 'Topic not found.' using errcode = 'P0002';
  end if;

  -- Check the books before writing anything.
  if p_books is null or jsonb_typeof(p_books) <> 'array'
     or jsonb_array_length(p_books) < 1 or jsonb_array_length(p_books) > 100 then
    raise exception 'Send 1 to 100 books.' using errcode = '22023';
  end if;

  for v_book, v_pos in select e, o::int from jsonb_array_elements(p_books) with ordinality as x(e, o) loop
    if jsonb_typeof(v_book) <> 'object'
       or (select array_agg(k order by k) from jsonb_object_keys(v_book) k)
          is distinct from array['author', 'bsr', 'included', 'rating', 'reviews', 'sponsored', 'title'] then
      raise exception 'Book % has the wrong fields.', v_pos using errcode = '22023';
    end if;
    if jsonb_typeof(v_book->'title') <> 'string'
       or char_length(btrim(v_book->>'title')) not between 1 and 300 then
      raise exception 'Book % needs a title of 1 to 300 characters.', v_pos using errcode = '22023';
    end if;
    if jsonb_typeof(v_book->'author') not in ('string', 'null')
       or char_length(v_book->>'author') > 200 then
      raise exception 'Book % has a bad author.', v_pos using errcode = '22023';
    end if;
    if jsonb_typeof(v_book->'bsr') not in ('number', 'null')
       or (jsonb_typeof(v_book->'bsr') = 'number'
           and ((v_book->>'bsr')::numeric <> trunc((v_book->>'bsr')::numeric)
                or (v_book->>'bsr')::numeric not between 1 and 100000000)) then
      raise exception 'Book % has a bad BSR.', v_pos using errcode = '22023';
    end if;
    if jsonb_typeof(v_book->'reviews') not in ('number', 'null')
       or (jsonb_typeof(v_book->'reviews') = 'number'
           and ((v_book->>'reviews')::numeric <> trunc((v_book->>'reviews')::numeric)
                or (v_book->>'reviews')::numeric not between 0 and 10000000)) then
      raise exception 'Book % has bad reviews.', v_pos using errcode = '22023';
    end if;
    if jsonb_typeof(v_book->'rating') not in ('number', 'null')
       or (jsonb_typeof(v_book->'rating') = 'number'
           and (v_book->>'rating')::numeric not between 0 and 5) then
      raise exception 'Book % has a bad rating.', v_pos using errcode = '22023';
    end if;
    if jsonb_typeof(v_book->'sponsored') <> 'boolean' or jsonb_typeof(v_book->'included') <> 'boolean' then
      raise exception 'Book % needs sponsored and included.', v_pos using errcode = '22023';
    end if;
  end loop;

  -- Replace the page-1 books.
  delete from public.topic_page_books where topic_id = p_topic_id;

  insert into public.topic_page_books
    (user_id, topic_id, position, title, author, bsr, reviews, rating, sponsored, included)
  select v_user_id,
         p_topic_id,
         x.o::smallint,
         btrim(x.e->>'title'),
         nullif(btrim(x.e->>'author'), ''),
         (x.e->>'bsr')::int,
         (x.e->>'reviews')::int,
         round((x.e->>'rating')::numeric, 1),
         (x.e->>'sponsored')::boolean,
         (x.e->>'included')::boolean
    from jsonb_array_elements(p_books) with ordinality as x(e, o);

  -- Our rules count. Never the AI. A null BSR or reviews makes its test
  -- null, so the book is not counted by that rule.
  select count(*) filter (where b.bsr is not null and b.reviews is not null
                            and b.bsr <= 30000 and b.reviews <= 250),
         count(*) filter (where b.bsr is not null and b.reviews is not null
                            and b.bsr >= 150000 and b.reviews >= 30),
         count(*) filter (where b.reviews is not null and b.reviews >= 500)
    into v_winning, v_dead, v_authority
    from public.topic_page_books b
   where b.topic_id = p_topic_id
     and b.included;

  -- Keep manual counts unless asked to replace them.
  v_keep_w := v_topic.winning_source   = 'manual' and not coalesce(p_replace_manual, false);
  v_keep_d := v_topic.dead_source      = 'manual' and not coalesce(p_replace_manual, false);
  v_keep_a := v_topic.authority_source = 'manual' and not coalesce(p_replace_manual, false);
  v_w := case when v_keep_w then v_topic.winning_count   else v_winning   end;
  v_d := case when v_keep_d then v_topic.dead_count      else v_dead      end;
  v_a := case when v_keep_a then v_topic.authority_count else v_authority end;

  -- Same formula as topics.checks_passed (0001).
  v_passed := coalesce(v_w >= 3, false)::int
            + coalesce(v_d <= 8, false)::int
            + coalesce(v_a <= 4, false)::int
            + coalesce(v_topic.results_match, false)::int
            + coalesce(v_topic.is_specific, false)::int;

  v_status := case
    when v_topic.status = 'idea' then 'researching'
    when v_topic.status = 'validated' and v_passed < 5 then 'researching'
    else v_topic.status
  end;

  perform set_config('kdp.topic_import', 'on', true);

  update public.topics t
     set winning_count    = v_w,
         winning_source   = case when v_keep_w then v_topic.winning_source   else 'imported' end,
         winning_set_at   = case when v_keep_w then v_topic.winning_set_at   else now() end,
         dead_count       = v_d,
         dead_source      = case when v_keep_d then v_topic.dead_source      else 'imported' end,
         dead_set_at      = case when v_keep_d then v_topic.dead_set_at      else now() end,
         authority_count  = v_a,
         authority_source = case when v_keep_a then v_topic.authority_source else 'imported' end,
         authority_set_at = case when v_keep_a then v_topic.authority_set_at else now() end,
         status           = v_status
   where t.id = p_topic_id
  returning t.* into v_row;

  perform set_config('kdp.topic_import', '', true);

  return v_row;
end;
$$;

comment on function public.save_topic_import(uuid, jsonb, boolean) is
  'Saves the page-1 books of a topic and the counts computed from them, in one transaction. Manual counts stay unless p_replace_manual.';

revoke execute on function public.save_topic_import(uuid, jsonb, boolean) from public, anon;
grant  execute on function public.save_topic_import(uuid, jsonb, boolean) to authenticated;
