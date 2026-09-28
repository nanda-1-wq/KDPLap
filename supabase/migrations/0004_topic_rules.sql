-- 0004_topic_rules.sql
-- KDP Lab · E4 · Topic Lab rules.
--
-- 1. A topic is 'validated' only when all 5 market checks pass.
-- 2. A topic name is 1 to 200 characters after trim (Add topic and Rename
--    write topics.name directly under Row Level Security).
-- 3. When the last book of a 'book_started' topic is deleted, the topic goes
--    back to 'validated' (or 'researching' if it no longer passes all 5).
--
-- Checked before writing (read-only): public.topics has 0 rows, so no
-- existing row fails either check.

-- ---------------------------------------------------------------------------
-- 1. Validated needs 5 of 5
-- ---------------------------------------------------------------------------
-- checks_passed is a stored generated column; check constraints see its new value.
alter table public.topics
  add constraint topics_validated_needs_all_checks
  check (status <> 'validated' or checks_passed = 5);

-- ---------------------------------------------------------------------------
-- 2. Name length
-- ---------------------------------------------------------------------------
alter table public.topics
  add constraint topics_name_length_check
  check (char_length(btrim(name)) between 1 and 200);

-- ---------------------------------------------------------------------------
-- 3. Reset the topic after its last book is deleted
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER: runs as the user who deleted the book, so Row Level
-- Security applies. That user owns the book, and create_book only links a
-- book to the user's own topic, so the topic and its other books are visible.
-- The topic goes to 'researching' when it no longer has 5 of 5, because
-- 'validated' would break constraint 1 and block the book delete.
create or replace function public.reset_topic_after_book_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.topic_id is null then
    return null;
  end if;

  update public.topics t
     set status = case when t.checks_passed = 5 then 'validated' else 'researching' end
   where t.id = old.topic_id
     and t.status = 'book_started'
     and not exists (
       select 1
         from public.books b
        where b.topic_id = old.topic_id
     );

  return null;
end;
$$;

comment on function public.reset_topic_after_book_delete() is
  'After a book is deleted: if its topic is book_started and has no books left, set it back to validated (or researching below 5 checks).';

create trigger books_reset_topic_after_delete
  after delete on public.books
  for each row execute function public.reset_topic_after_book_delete();

-- A trigger function is never called directly. Supabase grants EXECUTE on new
-- functions to anon and authenticated by default, so revoke it.
revoke execute on function public.reset_topic_after_book_delete() from public, anon, authenticated;
