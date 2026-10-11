-- DrinkRate: database setup for Supabase.
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run again: it only creates what is missing and replaces the functions.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.dr_users (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  name_key     text not null unique,
  pin_hash     text not null,
  token        uuid not null unique default gen_random_uuid(),
  failed       int not null default 0,
  locked_until timestamptz,
  created_at   timestamptz not null default now()
);

create table if not exists public.dr_ratings (
  user_id    uuid not null references public.dr_users(id) on delete cascade,
  drink_id   text not null,
  stars      int  not null check (stars between 1 and 5),
  comment    text check (char_length(comment) <= 300),
  updated_at timestamptz not null default now(),
  primary key (user_id, drink_id)
);

-- Tables are only reachable through the functions below.
alter table public.dr_users   enable row level security;
alter table public.dr_ratings enable row level security;
revoke all on public.dr_users, public.dr_ratings from anon, authenticated;

-- Names of everyone who has a user (shown on the login screen).
create or replace function public.dr_list_users()
returns json language sql security definer set search_path = public as $$
  select coalesce(json_agg(name order by created_at), '[]'::json) from dr_users;
$$;

create or replace function public.dr_register(p_name text, p_pin text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_user dr_users;
begin
  if char_length(v_name) < 1 or char_length(v_name) > 24 then
    return json_build_object('error', 'BAD_NAME');
  end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    return json_build_object('error', 'BAD_PIN');
  end if;
  if exists (select 1 from dr_users where name_key = lower(v_name)) then
    return json_build_object('error', 'NAME_TAKEN');
  end if;
  insert into dr_users (name, name_key, pin_hash)
  values (v_name, lower(v_name), extensions.crypt(p_pin, extensions.gen_salt('bf')))
  returning * into v_user;
  return json_build_object('token', v_user.token, 'name', v_user.name);
end $$;

create or replace function public.dr_login(p_name text, p_pin text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_user dr_users;
begin
  select * into v_user from dr_users
  where name_key = lower(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')));
  if not found then
    return json_build_object('error', 'NO_USER');
  end if;
  if v_user.locked_until is not null and v_user.locked_until > now() then
    return json_build_object('error', 'LOCKED');
  end if;
  if v_user.pin_hash <> extensions.crypt(coalesce(p_pin, ''), v_user.pin_hash) then
    update dr_users
       set failed = case when failed + 1 >= 8 then 0 else failed + 1 end,
           locked_until = case when failed + 1 >= 8 then now() + interval '5 minutes' else null end
     where id = v_user.id;
    return json_build_object('error', 'BAD_PIN');
  end if;
  update dr_users set failed = 0, locked_until = null where id = v_user.id;
  return json_build_object('token', v_user.token, 'name', v_user.name);
end $$;

-- Every rating from the whole family. Needs a valid token.
create or replace function public.dr_get_ratings(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_me dr_users;
begin
  select * into v_me from dr_users where token = p_token;
  if not found then
    return json_build_object('error', 'BAD_TOKEN');
  end if;
  return json_build_object(
    'me', v_me.name,
    'ratings', coalesce((
      select json_agg(json_build_object(
               'drink', r.drink_id, 'name', u.name, 'stars', r.stars,
               'comment', r.comment, 'at', r.updated_at) order by r.updated_at desc)
        from dr_ratings r join dr_users u on u.id = r.user_id), '[]'::json));
end $$;

-- Set (or with p_stars = null, remove) my rating of a drink.
create or replace function public.dr_rate(p_token uuid, p_drink text, p_stars int, p_comment text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_me dr_users;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  select * into v_me from dr_users where token = p_token;
  if not found then
    return json_build_object('error', 'BAD_TOKEN');
  end if;
  if coalesce(p_drink, '') !~ '^[a-z0-9-]{1,60}$' then
    return json_build_object('error', 'BAD_DRINK');
  end if;
  if p_stars is null then
    delete from dr_ratings where user_id = v_me.id and drink_id = p_drink;
    return json_build_object('ok', true);
  end if;
  if p_stars < 1 or p_stars > 5 then
    return json_build_object('error', 'BAD_STARS');
  end if;
  insert into dr_ratings (user_id, drink_id, stars, comment)
  values (v_me.id, p_drink, p_stars, left(v_comment, 300))
  on conflict (user_id, drink_id)
  do update set stars = excluded.stars, comment = excluded.comment, updated_at = now();
  return json_build_object('ok', true);
end $$;

revoke all on function public.dr_list_users(), public.dr_register(text, text),
  public.dr_login(text, text), public.dr_get_ratings(uuid), public.dr_rate(uuid, text, int, text) from public;
grant execute on function public.dr_list_users(), public.dr_register(text, text),
  public.dr_login(text, text), public.dr_get_ratings(uuid), public.dr_rate(uuid, text, int, text) to anon, authenticated;

notify pgrst, 'reload schema';
