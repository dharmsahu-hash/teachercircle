-- Table-level grants PostgREST's anon/authenticated roles need before RLS
-- policies even get a chance to run — Postgres checks GRANTs first, then RLS
-- filters which rows are visible. Broad grants here + narrow RLS policies
-- above is the standard, correct pattern: an anon request against a table
-- with no anon-matching policy simply gets zero rows back, not an error.

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated, anon;

alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant execute on functions to authenticated, anon;
