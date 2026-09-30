-- 0009_book_touch.sql
-- KDP Lab · After E7 · Brief and Research edits move the book to the top of Books.
--
-- The Books page sorts by books.updated_at. Step 01 (Brief) and step 02
-- (Research) write to child tables, so the book row itself did not change and
-- the book stayed where it was. This trigger touches books.updated_at after
-- every insert, update or delete on:
--   book_briefs · competitors · research_sources · research_insights
--
-- - One touch per book per transaction: "updated_at < now()" skips the book
--   when it was already touched in this transaction (now() is the
--   transaction start), so copying 10 competitors in one insert writes the
--   book once. The books_set_updated_at trigger (0001) sets the value.
-- - SECURITY INVOKER: the update runs under the caller's Row Level Security.
--   The child row policies already require the caller to own the book.
-- - Deleting a book cascades to these tables. The book row is already gone
--   then, so the update matches no row and does nothing.
-- - An update that moves a row to another book touches both books.

-- ---------------------------------------------------------------------------

create or replace function public.touch_book_from_child()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.books b
     set updated_at = now()
   where b.updated_at < now()
     and b.id in (
       case when tg_op = 'DELETE' then old.book_id else new.book_id end,
       case when tg_op = 'UPDATE' then old.book_id end
     );
  return null;
end;
$$;

comment on function public.touch_book_from_child() is
  'Trigger: a Brief or Research change sets books.updated_at, so the book moves to the top of Books.';

create trigger book_briefs_touch_book
  after insert or update or delete on public.book_briefs
  for each row execute function public.touch_book_from_child();

create trigger competitors_touch_book
  after insert or update or delete on public.competitors
  for each row execute function public.touch_book_from_child();

create trigger research_sources_touch_book
  after insert or update or delete on public.research_sources
  for each row execute function public.touch_book_from_child();

create trigger research_insights_touch_book
  after insert or update or delete on public.research_insights
  for each row execute function public.touch_book_from_child();

-- A trigger function is never called directly. Supabase grants EXECUTE on new
-- functions to anon and authenticated by default, so revoke it.
revoke execute on function public.touch_book_from_child() from public, anon, authenticated;
