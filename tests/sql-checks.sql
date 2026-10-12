-- Database checks run by tests/run.sh after the SQL files and tests/seed.sql.
-- Every check raises an error (and stops the run) when it fails.

-- Closed registration: a direct call is refused and nothing is inserted.
do $$
declare
  v_before int := (select count(*) from dr_users);
  v_res json;
begin
  set local role anon;
  v_res := dr_register('Inntrenger', '1234');
  reset role;
  if v_res->>'error' is distinct from 'REGISTRATION_CLOSED' then
    raise exception 'dr_register should be closed, got %', v_res;
  end if;
  if (select count(*) from dr_users) <> v_before then
    raise exception 'dr_register inserted a user';
  end if;
end $$;

-- Existing family members still log in and read; a bad token is refused.
do $$
declare
  v_login json;
  v_read json;
begin
  set local role anon;
  v_login := dr_login('Jesper', '1234');
  v_read := dr_get_ratings((v_login->>'token')::uuid);
  if v_login->>'token' is null or json_array_length(v_read->'ratings') <> 2 then
    raise exception 'existing login/read broken: % %', v_login, v_read;
  end if;
  if dr_get_ratings('00000000-0000-0000-0000-000000000000')->>'error' <> 'BAD_TOKEN'
     or dr_rate('00000000-0000-0000-0000-000000000000', 'mojito', 5, null, null)->>'error' <> 'BAD_TOKEN' then
    raise exception 'bad token was not refused';
  end if;
  reset role;
end $$;

-- Running the migration again keeps every user and rating.
create temp table before_counts as
  select (select count(*) from dr_users) as users, (select count(*) from dr_ratings) as ratings;
\ir ../supabase/security_holiday.sql
\ir ../supabase/stickers.sql
do $$ begin
  if (select users from before_counts) <> (select count(*) from dr_users)
     or (select ratings from before_counts) <> (select count(*) from dr_ratings) then
    raise exception 'running the SQL files again changed data';
  end if;
end $$;
