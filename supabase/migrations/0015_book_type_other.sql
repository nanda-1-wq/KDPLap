-- 0015_book_type_other.sql
-- KDP Lab · Batch C2 · More book types and "Other" (step 01 Brief).
--
-- 1. book_briefs.book_type takes six more keys and 'other' (owner decision,
--    Batch C2). Same keys and order as js/book-brief.js BOOK_TYPES and
--    generate lib/common.ts BOOK_TYPES.
-- 2. book_briefs.book_type_label
--      The author's own short name for an "Other" book type, 1 to 40
--      characters after trim. Only with book_type = 'other'; 'other' with
--      no label is allowed (the field is still empty). The browser sends
--      both columns in one update, so the check never fails mid-way.
--      The AI gets the label as escaped data inside <book_type>.
--
-- The new column is nullable with no default, so existing rows stay valid.
-- RLS is per row (0001), so it follows the existing policies.
--
-- Checked before writing (read-only, 2026-10-07): 4 briefs, book_type three
-- null and one 'self_help'. The live check is book_briefs_book_type_check
-- (the 0001 list). No row can fail the new checks.

-- ---------------------------------------------------------------------------
-- 1. Book type keys
-- ---------------------------------------------------------------------------
alter table public.book_briefs drop constraint book_briefs_book_type_check;

alter table public.book_briefs
  add constraint book_briefs_book_type_check
  check (book_type in ('beginner_guide', 'how_to', 'workbook', 'self_help', 'cookbook',
                       'health_wellness', 'business_money', 'parenting_family',
                       'hobby_craft', 'reference', 'memoir', 'other'));

-- ---------------------------------------------------------------------------
-- 2. "Other" label
-- ---------------------------------------------------------------------------
alter table public.book_briefs add column book_type_label text;

alter table public.book_briefs
  add constraint book_briefs_book_type_label_check
  check (book_type_label is null
         or (book_type is not distinct from 'other'      -- a null type must not pass
             and char_length(btrim(book_type_label)) between 1 and 40));

comment on column public.book_briefs.book_type_label is
  'The author''s name for an "Other" book type, 1 to 40 characters. Only with book_type = ''other''.';
