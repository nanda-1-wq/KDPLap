-- 0001_v1_data_model.sql
-- KDP Lab v1 data model.
-- Every table has RLS. Policies are for the "authenticated" role only.
-- A user reads and writes only rows where user_id = auth.uid().
-- Child tables also check on INSERT/UPDATE that the parent row belongs to the same user.

-- ---------------------------------------------------------------------------
-- 0. Clean up the old prototype table (0 rows)
-- ---------------------------------------------------------------------------
drop table if exists public.books cascade;

-- ---------------------------------------------------------------------------
-- 1. Shared updated_at trigger function
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. pen_names
-- ---------------------------------------------------------------------------
create table public.pen_names (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 100),
  niche       text,
  bio_facts   jsonb not null default '{}',
  bio_text    text,
  voice       jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index pen_names_user_id_idx on public.pen_names (user_id);

-- ---------------------------------------------------------------------------
-- 3. topics
-- ---------------------------------------------------------------------------
create table public.topics (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name              text not null,
  status            text not null default 'idea'
                    check (status in ('idea', 'researching', 'validated', 'book_started', 'rejected', 'archived')),
  winning_count     int check (winning_count >= 0),
  dead_count        int check (dead_count >= 0),
  authority_count   int check (authority_count >= 0),
  monthly_searches  int check (monthly_searches >= 0),
  results_match     boolean,
  is_specific       boolean,
  excitement        smallint check (excitement between 1 and 10),
  author_fit        smallint check (author_fit between 1 and 10),
  notes             text,
  -- Market checks passed (0 to 5). A null value counts as not passed.
  checks_passed     smallint generated always as (
                      (
                        (coalesce(winning_count >= 3, false))::int
                      + (coalesce(dead_count <= 8, false))::int
                      + (coalesce(authority_count <= 4, false))::int
                      + (coalesce(results_match, false))::int
                      + (coalesce(is_specific, false))::int
                      )::smallint
                    ) stored,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index topics_user_id_idx on public.topics (user_id);

-- ---------------------------------------------------------------------------
-- 4. user_settings
-- ---------------------------------------------------------------------------
create table public.user_settings (
  user_id              uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  default_trim         text not null default '6x9'
                       check (default_trim ~ '^[0-9]+(\.[0-9]+)?x[0-9]+(\.[0-9]+)?$'),
  default_pen_name_id  uuid references public.pen_names (id) on delete set null,
  language             text not null default 'en',
  monthly_token_limit  int not null default 2000000 check (monthly_token_limit >= 0),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index user_settings_default_pen_name_id_idx on public.user_settings (default_pen_name_id);

-- ---------------------------------------------------------------------------
-- 5. books
-- ---------------------------------------------------------------------------
create table public.books (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  topic_id             uuid references public.topics (id) on delete set null,
  pen_name_id          uuid references public.pen_names (id) on delete restrict,
  title                text,
  subtitle             text,
  series_name          text,
  series_number        int,
  title_examples       text[] not null default '{}',
  current_step         smallint not null default 1 check (current_step between 1 and 11),
  status               text not null default 'in_progress'
                       check (status in ('in_progress', 'completed')),
  outline_approved_at  timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index books_user_id_idx     on public.books (user_id);
create index books_topic_id_idx    on public.books (topic_id);
create index books_pen_name_id_idx on public.books (pen_name_id);

-- ---------------------------------------------------------------------------
-- 6. book_briefs (one per book)
-- ---------------------------------------------------------------------------
create table public.book_briefs (
  book_id         uuid primary key references public.books (id) on delete cascade,
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  topic_text      text,
  target_reader   text,
  reader_problem  text,
  promise_draft   text,
  book_type       text check (book_type in ('beginner_guide', 'how_to', 'workbook', 'self_help', 'cookbook')),
  trim_size       text not null default '6x9'
                  check (trim_size ~ '^[0-9]+(\.[0-9]+)?x[0-9]+(\.[0-9]+)?$'),
  length_range    text check (length_range in ('5-8k', '8-12k', '12-20k', '20-30k', '30k+')),
  chapter_count   smallint check (chapter_count between 3 and 30),
  options         jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index book_briefs_user_id_idx on public.book_briefs (user_id);

-- ---------------------------------------------------------------------------
-- 7. competitors
-- ---------------------------------------------------------------------------
create table public.competitors (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_id       uuid not null references public.books (id) on delete cascade,
  title         text not null,
  author        text,
  bsr           int check (bsr >= 0),
  reviews       int check (reviews >= 0),
  rating        numeric(2,1) check (rating between 0 and 5),
  toc           text,
  low_reviews   text,
  high_reviews  text,
  is_authority  boolean generated always as (coalesce(reviews, 0) >= 500) stored,
  created_at    timestamptz not null default now()
);

create index competitors_user_id_idx on public.competitors (user_id);
create index competitors_book_id_idx on public.competitors (book_id);

-- ---------------------------------------------------------------------------
-- 8. research_sources
-- ---------------------------------------------------------------------------
create table public.research_sources (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_id     uuid not null references public.books (id) on delete cascade,
  kind        text not null check (kind in ('source', 'note')),
  body        text not null,
  citation    text,
  created_at  timestamptz not null default now()
);

create index research_sources_user_id_idx on public.research_sources (user_id);
create index research_sources_book_id_idx on public.research_sources (book_id);

-- ---------------------------------------------------------------------------
-- 9. research_insights (one per book)
-- ---------------------------------------------------------------------------
create table public.research_insights (
  book_id      uuid primary key references public.books (id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  loves        jsonb not null default '[]',
  hates        jsonb not null default '[]',
  gaps         jsonb not null default '[]',
  analyzed_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index research_insights_user_id_idx on public.research_insights (user_id);

-- ---------------------------------------------------------------------------
-- 10. positioning (one per book)
-- ---------------------------------------------------------------------------
create table public.positioning (
  book_id         uuid primary key references public.books (id) on delete cascade,
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  one_sentence    text,
  reader_promise  text,
  approach        text,
  lacks           jsonb not null default '[]',
  selling_points  jsonb not null default '[]',
  drift_flags     jsonb not null default '[]',
  focus_tags      text[] not null default '{}',
  locked_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index positioning_user_id_idx on public.positioning (user_id);

-- ---------------------------------------------------------------------------
-- 11. title_options
-- ---------------------------------------------------------------------------
create table public.title_options (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_id      uuid not null references public.books (id) on delete cascade,
  title        text not null,
  subtitle     text,
  reason       text,
  keywords     text[] not null default '{}',
  shortlisted  boolean not null default false,
  created_at   timestamptz not null default now()
);

create index title_options_user_id_idx on public.title_options (user_id);
create index title_options_book_id_idx on public.title_options (book_id);

-- ---------------------------------------------------------------------------
-- 12. chapters
-- ---------------------------------------------------------------------------
create table public.chapters (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_id           uuid not null references public.books (id) on delete cascade,
  position          int not null,
  kind              text not null default 'chapter'
                    check (kind in ('intro', 'chapter', 'conclusion')),
  title             text,
  objective         text,
  word_target       int check (word_target >= 0),
  include_examples  boolean not null default true,
  include_exercise  boolean not null default true,
  needs_review      boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Deferred so a reorder can swap positions inside one transaction.
  constraint chapters_book_position_key unique (book_id, position) deferrable initially deferred
);

create index chapters_user_id_idx on public.chapters (user_id);
-- book_id is covered by the leading column of chapters_book_position_key.

-- ---------------------------------------------------------------------------
-- 13. sections
-- ---------------------------------------------------------------------------
create table public.sections (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  chapter_id          uuid not null references public.chapters (id) on delete cascade,
  position            int not null,
  title               text,
  word_target         int check (word_target >= 0),
  status              text not null default 'not_started'
                      check (status in ('not_started', 'draft', 'reviewed', 'final')),
  needs_review        boolean not null default false,
  current_version_id  uuid,  -- FK added after section_versions exists
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint sections_chapter_position_key unique (chapter_id, position) deferrable initially deferred
);

create index sections_user_id_idx            on public.sections (user_id);
create index sections_current_version_id_idx on public.sections (current_version_id);
-- chapter_id is covered by the leading column of sections_chapter_position_key.

-- ---------------------------------------------------------------------------
-- 14. section_versions (insert-only history)
-- ---------------------------------------------------------------------------
create table public.section_versions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  section_id  uuid not null references public.sections (id) on delete cascade,
  version_no  int not null,
  content     text not null default '',
  word_count  int not null default 0 check (word_count >= 0),
  source      text not null
              check (source in ('manual', 'generate', 'edit_format', 'improve', 'expand',
                                'shorten', 'humanize', 'custom', 'restore')),
  label       text,
  checks      jsonb not null default '{}',
  partial     boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint section_versions_section_version_key unique (section_id, version_no)
);

create index section_versions_user_id_idx on public.section_versions (user_id);
-- section_id is covered by the leading column of section_versions_section_version_key.

alter table public.sections
  add constraint sections_current_version_id_fkey
  foreign key (current_version_id) references public.section_versions (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 15. ai_usage (written by Edge Functions with the service role)
-- ---------------------------------------------------------------------------
create table public.ai_usage (
  id             bigint generated always as identity primary key,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_id        uuid references public.books (id) on delete set null,
  stage          text not null,
  model          text,
  input_tokens   int not null default 0 check (input_tokens >= 0),
  output_tokens  int not null default 0 check (output_tokens >= 0),
  status         text not null check (status in ('ok', 'failed', 'stopped')),
  counted        boolean not null default true,
  created_at     timestamptz not null default now()
);

create index ai_usage_user_id_idx on public.ai_usage (user_id);
create index ai_usage_book_id_idx on public.ai_usage (book_id);

-- ---------------------------------------------------------------------------
-- 16. updated_at triggers
-- ---------------------------------------------------------------------------
create trigger pen_names_set_updated_at         before update on public.pen_names         for each row execute function public.set_updated_at();
create trigger topics_set_updated_at            before update on public.topics            for each row execute function public.set_updated_at();
create trigger user_settings_set_updated_at     before update on public.user_settings     for each row execute function public.set_updated_at();
create trigger books_set_updated_at             before update on public.books             for each row execute function public.set_updated_at();
create trigger book_briefs_set_updated_at       before update on public.book_briefs       for each row execute function public.set_updated_at();
create trigger research_insights_set_updated_at before update on public.research_insights for each row execute function public.set_updated_at();
create trigger positioning_set_updated_at       before update on public.positioning       for each row execute function public.set_updated_at();
create trigger chapters_set_updated_at          before update on public.chapters          for each row execute function public.set_updated_at();
create trigger sections_set_updated_at          before update on public.sections          for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 17. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.pen_names         enable row level security;
alter table public.topics            enable row level security;
alter table public.user_settings     enable row level security;
alter table public.books             enable row level security;
alter table public.book_briefs       enable row level security;
alter table public.competitors       enable row level security;
alter table public.research_sources  enable row level security;
alter table public.research_insights enable row level security;
alter table public.positioning       enable row level security;
alter table public.title_options     enable row level security;
alter table public.chapters          enable row level security;
alter table public.sections          enable row level security;
alter table public.section_versions  enable row level security;
alter table public.ai_usage          enable row level security;

-- pen_names ------------------------------------------------------------------
create policy "pen_names_select_own" on public.pen_names
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "pen_names_insert_own" on public.pen_names
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "pen_names_update_own" on public.pen_names
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "pen_names_delete_own" on public.pen_names
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- topics ---------------------------------------------------------------------
create policy "topics_select_own" on public.topics
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "topics_insert_own" on public.topics
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "topics_update_own" on public.topics
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "topics_delete_own" on public.topics
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- user_settings (default pen name must be the user's own) --------------------
create policy "user_settings_select_own" on public.user_settings
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "user_settings_insert_own" on public.user_settings
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      default_pen_name_id is null
      or exists (select 1 from public.pen_names p
                 where p.id = default_pen_name_id and p.user_id = (select auth.uid()))
    )
  );

create policy "user_settings_update_own" on public.user_settings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      default_pen_name_id is null
      or exists (select 1 from public.pen_names p
                 where p.id = default_pen_name_id and p.user_id = (select auth.uid()))
    )
  );

create policy "user_settings_delete_own" on public.user_settings
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- books (topic and pen name, when set, must be the user's own) ---------------
create policy "books_select_own" on public.books
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "books_insert_own" on public.books
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      topic_id is null
      or exists (select 1 from public.topics t
                 where t.id = topic_id and t.user_id = (select auth.uid()))
    )
    and (
      pen_name_id is null
      or exists (select 1 from public.pen_names p
                 where p.id = pen_name_id and p.user_id = (select auth.uid()))
    )
  );

create policy "books_update_own" on public.books
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      topic_id is null
      or exists (select 1 from public.topics t
                 where t.id = topic_id and t.user_id = (select auth.uid()))
    )
    and (
      pen_name_id is null
      or exists (select 1 from public.pen_names p
                 where p.id = pen_name_id and p.user_id = (select auth.uid()))
    )
  );

create policy "books_delete_own" on public.books
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- book_briefs (parent: books) ------------------------------------------------
create policy "book_briefs_select_own" on public.book_briefs
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "book_briefs_insert_own" on public.book_briefs
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b
                where b.id = book_id and b.user_id = (select auth.uid()))
  );

create policy "book_briefs_update_own" on public.book_briefs
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b
                where b.id = book_id and b.user_id = (select auth.uid()))
  );

create policy "book_briefs_delete_own" on public.book_briefs
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- competitors (parent: books) ------------------------------------------------
create policy "competitors_select_own" on public.competitors
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "competitors_insert_own" on public.competitors
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b
                where b.id = book_id and b.user_id = (select auth.uid()))
  );

create policy "competitors_update_own" on public.competitors
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b
                where b.id = book_id and b.user_id = (select auth.uid()))
  );

create policy "competitors_delete_own" on public.competitors
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- research_sources (parent: books) -------------------------------------------
create policy "research_sources_select_own" on public.research_sources
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "research_sources_insert_own" on public.research_sources
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b
                where b.id = book_id and b.user_id = (select auth.uid()))
  );

create policy "research_sources_update_own" on public.research_sources
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b
                where b.id = book_id and b.user_id = (select auth.uid()))
  );

create policy "research_sources_delete_own" on public.research_sources
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- research_insights (parent: books) ------------------------------------------
create policy "research_insights_select_own" on public.research_insights
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "research_insights_insert_own" on public.research_insights
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b
                where b.id = book_id and b.user_id = (select auth.uid()))
  );

create policy "research_insights_update_own" on public.research_insights
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b
                where b.id = book_id and b.user_id = (select auth.uid()))
  );

create policy "research_insights_delete_own" on public.research_insights
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- positioning (parent: books) ------------------------------------------------
create policy "positioning_select_own" on public.positioning
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "positioning_insert_own" on public.positioning
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b
                where b.id = book_id and b.user_id = (select auth.uid()))
  );

create policy "positioning_update_own" on public.positioning
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b
                where b.id = book_id and b.user_id = (select auth.uid()))
  );

create policy "positioning_delete_own" on public.positioning
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- title_options (parent: books) ----------------------------------------------
create policy "title_options_select_own" on public.title_options
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "title_options_insert_own" on public.title_options
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b
                where b.id = book_id and b.user_id = (select auth.uid()))
  );

create policy "title_options_update_own" on public.title_options
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b
                where b.id = book_id and b.user_id = (select auth.uid()))
  );

create policy "title_options_delete_own" on public.title_options
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- chapters (parent: books) ---------------------------------------------------
create policy "chapters_select_own" on public.chapters
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "chapters_insert_own" on public.chapters
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b
                where b.id = book_id and b.user_id = (select auth.uid()))
  );

create policy "chapters_update_own" on public.chapters
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b
                where b.id = book_id and b.user_id = (select auth.uid()))
  );

create policy "chapters_delete_own" on public.chapters
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- sections (parent: chapters; current version must belong to this section) ---
create policy "sections_select_own" on public.sections
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "sections_insert_own" on public.sections
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.chapters c
                where c.id = chapter_id and c.user_id = (select auth.uid()))
    and current_version_id is null
  );

create policy "sections_update_own" on public.sections
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.chapters c
                where c.id = chapter_id and c.user_id = (select auth.uid()))
    and (
      current_version_id is null
      or exists (select 1 from public.section_versions v
                 where v.id = current_version_id
                   and v.section_id = sections.id
                   and v.user_id = (select auth.uid()))
    )
  );

create policy "sections_delete_own" on public.sections
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- section_versions (parent: sections) - INSERT-ONLY, no update or delete -----
create policy "section_versions_select_own" on public.section_versions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "section_versions_insert_own" on public.section_versions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.sections s
                where s.id = section_id and s.user_id = (select auth.uid()))
  );

-- ai_usage - SELECT only. Inserts come from Edge Functions (service role). ---
create policy "ai_usage_select_own" on public.ai_usage
  for select to authenticated
  using (user_id = (select auth.uid()));
