-- Shared by every t*.sql file: \ir helpers.sql
-- pg_temp.err(sql)  runs a statement: 'OK <rows>' or '<sqlstate> <message> | <detail>'.
-- pg_temp.chk(name, ok, got)  one result line: 'PASS name' or 'FAIL name  got: ...'.
-- pg_temp.expect(name, sql, pattern)  runs sql; PASS when the err() text is LIKE pattern.
\pset tuples_only on
\pset format unaligned
create function pg_temp.err(q text) returns text language plpgsql as $$
declare n int; d text;
begin
  execute q; get diagnostics n = row_count;
  return 'OK ' || n;
exception when others then
  get stacked diagnostics d = pg_exception_detail;
  return sqlstate || ' ' || sqlerrm || coalesce(' | ' || nullif(d, ''), '');
end $$;
create function pg_temp.chk(name text, ok boolean, got text default '') returns text language sql as $$
  select case when ok then 'PASS ' || name else 'FAIL ' || name || '  got: ' || coalesce(got, 'null') end $$;
create function pg_temp.expect(name text, q text, want text) returns text language plpgsql as $$
declare got text := pg_temp.err(q);
begin
  return pg_temp.chk(name, got like want, got);
end $$;
grant execute on all functions in schema pg_temp to public;
