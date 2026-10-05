-- 0011_title_rules.sql
-- KDP Lab · E8.2 · Title rules: limits, options cap, "Needs review".
--
-- Step 04 Title writes books.title_examples, books.title, books.subtitle and
-- title_options.shortlisted directly under Row Level Security. The generate
-- stage title_ideas inserts title_options as the user (RLS). This migration
-- makes the database enforce the same rules as the browser
-- (js/book-title.js, js/title-checks.js) and lib.ts.
--
-- 1. books
--      title_examples   at most 3, each 1 to 250 characters
--      subtitle         null, or 1 to 200 characters, and only with a title
--      title + subtitle at most 200 characters, counted as KDP shows it:
--                       title, or title + ": " + subtitle
--      title_needs_review  may go from true to false only while the book's
--                       positioning is locked (raises "positioning_not_locked")
-- 2. title_options
--      title            1 to 200 characters
--      subtitle         null, or 1 to 200 characters
--      title + subtitle at most 200 characters (same count as books)
--      reason           null, or 1 to 300 characters
--      keywords         at most 5, each 1 to 60 characters
--      unsourced        NEW. Numbers the server found in the option but not in
--                       the Brief, Research or positioning ("Verify: no source").
--                       At most 10, each 1 to 20 characters.
--      At most 40 options per book (raises "title_options_full").
--      After insert only "shortlisted" may change (raises "title_option_read_only").
--      Remove is a plain delete (RLS); the browser deletes only un-starred options.
-- 3. Option edits move the book to the top of Books (0009 trigger).
--
-- Checked before writing (read-only, 2026-10-01): 3 books, 0 with a title,
-- subtitle or examples, 0 marked "Needs review"; title_options has 0 rows.
-- No row can fail a check.

-- ---------------------------------------------------------------------------
-- Shared: the combined length, and a text[] list check
-- ---------------------------------------------------------------------------
create or replace function public.title_combined_length(t text, s text)
returns int
language sql
immutable
set search_path = ''
as $$
  select coalesce(char_length(t), 0)
         + case when s is null then 0 else 2 + char_length(s) end;
$$;

comment on function public.title_combined_length(text, text) is
  'E8.2: title + ": " + subtitle, in characters (the count step 04 shows).';

create or replace function public.text_items_ok(t text[], max_items int, max_chars int)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when t is null then false
    when cardinality(t) > max_items then false
    else not exists (select 1 from unnest(t) x
                      where x is null or char_length(x) > max_chars or char_length(btrim(x)) < 1)
  end;
$$;

comment on function public.text_items_ok(text[], int, int) is
  'E8.2: a text[] with at most max_items items, each 1 to max_chars characters (not blank).';

-- ---------------------------------------------------------------------------
-- 1. books
-- ---------------------------------------------------------------------------
alter table public.books
  add constraint books_title_examples_check
  check (public.text_items_ok(title_examples, 3, 250));

alter table public.books
  add constraint books_subtitle_length_check
  check (subtitle is null
         or (title is not null
             and char_length(subtitle) <= 200 and char_length(btrim(subtitle)) >= 1));

alter table public.books
  add constraint books_title_combined_check
  check (public.title_combined_length(title, subtitle) <= 200);

-- SECURITY INVOKER: the positioning read runs under the caller's RLS, so it
-- only sees the caller's own book. Errors are P0001 with a short code.
create or replace function public.books_title_review_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.title_needs_review and not new.title_needs_review
     and not exists (select 1 from public.positioning p
                      where p.book_id = new.id and p.locked_at is not null) then
    raise exception 'positioning_not_locked'
      using errcode = 'P0001',
            detail = 'Lock the positioning again before the title review can be cleared.';
  end if;
  return new;
end;
$$;

comment on function public.books_title_review_guard() is
  'Trigger (E8.2): title_needs_review goes back to false only while the positioning is locked. Raises P0001 "positioning_not_locked".';

create trigger books_title_review_guard
  before update of title_needs_review on public.books
  for each row execute function public.books_title_review_guard();

revoke execute on function public.books_title_review_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. title_options
-- ---------------------------------------------------------------------------
alter table public.title_options
  add column unsourced text[] not null default '{}';

alter table public.title_options
  add constraint title_options_title_length_check
  check (char_length(title) <= 200 and char_length(btrim(title)) >= 1);

alter table public.title_options
  add constraint title_options_subtitle_length_check
  check (subtitle is null
         or (char_length(subtitle) <= 200 and char_length(btrim(subtitle)) >= 1));

alter table public.title_options
  add constraint title_options_combined_check
  check (public.title_combined_length(title, subtitle) <= 200);

alter table public.title_options
  add constraint title_options_reason_length_check
  check (reason is null
         or (char_length(reason) <= 300 and char_length(btrim(reason)) >= 1));

alter table public.title_options
  add constraint title_options_keywords_check
  check (public.text_items_ok(keywords, 5, 60));

alter table public.title_options
  add constraint title_options_unsourced_check
  check (public.text_items_ok(unsourced, 10, 20));

-- At most 40 options per book, and an option is read-only except its star.
-- SECURITY INVOKER, like competitors_limit (0008): the lock and the count run
-- under the caller's RLS. Row-level BEFORE triggers see rows inserted earlier
-- in the same statement, so one insert of 10 options is capped too.
create or replace function public.title_options_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if (new.id, new.user_id, new.book_id, new.title, new.subtitle, new.reason,
        new.keywords, new.unsourced, new.created_at)
       is distinct from
       (old.id, old.user_id, old.book_id, old.title, old.subtitle, old.reason,
        old.keywords, old.unsourced, old.created_at) then
      raise exception 'title_option_read_only'
        using errcode = 'P0001',
              detail = 'Only the shortlist star of a title option can change.';
    end if;
    return new;
  end if;

  perform 1 from public.books b where b.id = new.book_id for update;
  if (select count(*) from public.title_options o where o.book_id = new.book_id) >= 40 then
    raise exception 'title_options_full'
      using errcode = 'P0001',
            detail = 'A book can have at most 40 title options.';
  end if;
  return new;
end;
$$;

comment on function public.title_options_guard() is
  'Trigger (E8.2): at most 40 title options per book (P0001 "title_options_full"); after insert only shortlisted may change (P0001 "title_option_read_only").';

create trigger title_options_guard
  before insert or update on public.title_options
  for each row execute function public.title_options_guard();

revoke execute on function public.title_options_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Option edits move the book to the top of Books (see 0009)
-- ---------------------------------------------------------------------------
create trigger title_options_touch_book
  after insert or update or delete on public.title_options
  for each row execute function public.touch_book_from_child();
