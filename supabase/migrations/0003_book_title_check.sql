-- 0003_book_title_check.sql
-- KDP Lab · E3.4 · A book title is either not set yet, or 1 to 200 characters.
--
-- Rename on the Books page (and step 04 later) writes books.title directly
-- under Row Level Security, so the database enforces the limit as well as
-- the browser. Null stays allowed: a new book has no title until one is set,
-- and the Books page shows the Brief's topic as the working title meanwhile.
--
-- Checked before writing: all existing rows have a null title, so none fail.

alter table public.books
  add constraint books_title_length_check
  check (title is null or char_length(btrim(title)) between 1 and 200);
