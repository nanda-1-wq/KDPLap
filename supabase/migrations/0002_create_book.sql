-- 0002_create_book.sql
-- KDP Lab · E3.3 · Create a book and its Brief in one transaction.
--
-- Called from the browser as rpc('create_book', { p_topic_id, p_topic_text }).
-- SECURITY INVOKER: runs as the signed-in user, so Row Level Security applies
-- to every read and write below.

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
  v_user_id    uuid := auth.uid();
  v_topic_name text;
  v_topic_text text;
  v_trim       text;
  v_book_id    uuid;
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
  select s.default_trim
    into v_trim
    from public.user_settings s
   where s.user_id = v_user_id;

  insert into public.books (user_id, topic_id)
  values (v_user_id, p_topic_id)
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
  'Creates a book and its Brief for the signed-in user. Optional validated topic is marked book_started.';

-- Signed-in users only. Supabase grants EXECUTE on new functions to anon by
-- default, so revoke it explicitly.
revoke execute on function public.create_book(uuid, text) from public, anon;
grant  execute on function public.create_book(uuid, text) to authenticated;
