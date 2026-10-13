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

-- Family variants: anyone can make one, names are unique, ratings use dr_rate, only the
-- maker can delete and only while nobody else has rated it. Cleans up after itself.
do $$
declare
  v_j uuid := (dr_login('Jesper', '1234')->>'token')::uuid;
  v_a uuid := (dr_login('Astri', '4321')->>'token')::uuid;
  v_add json;
  v_id text;
  v_ratings int := (select count(*) from dr_ratings);
begin
  set local role anon;
  v_add := dr_add_custom_drink(v_j, 'mojito', '  Mojito   uten sukker ', 'Rum, lime, mint og soda');
  v_id := v_add->>'id';
  if v_id !~ '^c-[a-z0-9]{10}$' then raise exception 'add failed: %', v_add; end if;
  if dr_add_custom_drink(v_a, 'mojito', 'MOJITO uten sukker', 'x y')->>'error' <> 'NAME_TAKEN'
     or dr_add_custom_drink(v_j, 'mojito', 'x', 'Rum')->>'error' <> 'BAD_NAME'
     or dr_add_custom_drink(v_j, 'mojito', 'Tom', ' ')->>'error' <> 'BAD_INGREDIENTS'
     or dr_add_custom_drink(v_j, 'Bad Id!', 'Navn', 'Rum')->>'error' <> 'BAD_DRINK'
     or dr_add_custom_drink('00000000-0000-0000-0000-000000000000', 'mojito', 'Navn', 'Rum')->>'error' <> 'BAD_TOKEN' then
    raise exception 'variant validation broken';
  end if;
  if (select count(*) from json_array_elements(dr_list_custom_drinks(v_a)) e where e->>'id' = v_id and e->>'name' = 'Mojito uten sukker' and e->>'by' = 'Jesper') <> 1 then
    raise exception 'variant not listed for the family';
  end if;
  if dr_rate(v_a, v_id, 7, null, 'God')->>'ok' is null then raise exception 'cannot rate a variant'; end if;
  if dr_remove_custom_drink(v_a, v_id)->>'error' <> 'NOT_YOURS'
     or dr_remove_custom_drink(v_j, v_id)->>'error' <> 'RATED_BY_OTHERS' then
    raise exception 'variant delete rules broken';
  end if;
  perform dr_rate(v_a, v_id, null, null, null);
  perform dr_rate(v_j, v_id, 9, null, null);
  if dr_remove_custom_drink(v_j, v_id)->>'ok' is null then raise exception 'maker could not delete'; end if;
  reset role;
  if exists (select 1 from dr_custom_drinks where id = v_id) or (select count(*) from dr_ratings) <> v_ratings then
    raise exception 'delete left data behind';
  end if;
  begin
    set local role anon;
    perform 1 from dr_custom_drinks;
    raise exception 'anon could read the table directly';
  exception when insufficient_privilege then reset role;
  end;
end $$;
\ir ../supabase/custom_drinks.sql
