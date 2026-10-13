-- DrinkRate: the family's own variants of a drink ("Mojito uten sukker").
-- Run after setup.sql (Supabase → SQL Editor → Run). Only adds things; nothing
-- existing is touched. Safe to run again.
--
-- A variant gets its own id (c-…), so it is rated like any other drink with the
-- existing dr_rate. Category and bars come from the drink it is based on.

create table if not exists public.dr_custom_drinks (
  id          text primary key check (id ~ '^c-[a-z0-9]{10}$'),
  base_id     text not null check (base_id ~ '^[a-z0-9-]{1,60}$'),
  name        text not null check (char_length(name) between 2 and 60),
  name_key    text not null unique,
  ingredients text not null check (char_length(ingredients) between 2 and 300),
  created_by  uuid not null references public.dr_users(id) on delete cascade,
  created_at  timestamptz not null default now()
);
alter table public.dr_custom_drinks enable row level security;
revoke all on public.dr_custom_drinks from anon, authenticated;

-- Make a variant. Answers { ok, id } or { error }.
create or replace function public.dr_add_custom_drink(p_token uuid, p_base text, p_name text, p_ingredients text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_me dr_users;
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_ingr text := btrim(coalesce(p_ingredients, ''));
  v_id text;
begin
  select * into v_me from dr_users where token = p_token;
  if not found then
    return json_build_object('error', 'BAD_TOKEN');
  end if;
  if coalesce(p_base, '') !~ '^[a-z0-9-]{1,60}$' then
    return json_build_object('error', 'BAD_DRINK');
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 60 then
    return json_build_object('error', 'BAD_NAME');
  end if;
  if char_length(v_ingr) < 2 or char_length(v_ingr) > 300 then
    return json_build_object('error', 'BAD_INGREDIENTS');
  end if;
  if (select count(*) from dr_custom_drinks where created_by = v_me.id) >= 50 then
    return json_build_object('error', 'TOO_MANY');
  end if;
  if exists (select 1 from dr_custom_drinks where name_key = lower(v_name)) then
    return json_build_object('error', 'NAME_TAKEN');
  end if;
  v_id := 'c-' || substr(md5(random()::text || clock_timestamp()::text || v_me.id::text), 1, 10);
  insert into dr_custom_drinks (id, base_id, name, name_key, ingredients, created_by)
  values (v_id, p_base, v_name, lower(v_name), v_ingr, v_me.id);
  return json_build_object('ok', true, 'id', v_id);
end $$;

-- Every variant, for everyone in the family.
create or replace function public.dr_list_custom_drinks(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from dr_users where token = p_token) then
    return json_build_object('error', 'BAD_TOKEN');
  end if;
  return coalesce((
    select json_agg(json_build_object('id', c.id, 'base', c.base_id, 'name', c.name, 'ingredients', c.ingredients,
             'by', u.name, 'at', c.created_at) order by c.created_at)
      from dr_custom_drinks c join dr_users u on u.id = c.created_by), '[]'::json);
end $$;

-- The maker may delete a variant as long as nobody else has rated it.
-- The maker's own rating (and photo) of it goes too.
create or replace function public.dr_remove_custom_drink(p_token uuid, p_id text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_me dr_users;
begin
  select * into v_me from dr_users where token = p_token;
  if not found then
    return json_build_object('error', 'BAD_TOKEN');
  end if;
  if not exists (select 1 from dr_custom_drinks where id = p_id and created_by = v_me.id) then
    return json_build_object('error', 'NOT_YOURS');
  end if;
  if exists (select 1 from dr_ratings where drink_id = p_id and user_id <> v_me.id) then
    return json_build_object('error', 'RATED_BY_OTHERS');
  end if;
  delete from dr_ratings where drink_id = p_id and user_id = v_me.id;
  delete from dr_custom_drinks where id = p_id;
  return json_build_object('ok', true);
end $$;

revoke all on function public.dr_add_custom_drink(uuid, text, text, text), public.dr_list_custom_drinks(uuid),
  public.dr_remove_custom_drink(uuid, text) from public;
grant execute on function public.dr_add_custom_drink(uuid, text, text, text), public.dr_list_custom_drinks(uuid),
  public.dr_remove_custom_drink(uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
