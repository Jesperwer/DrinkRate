-- DrinkRate: photos on ratings. Run after setup.sql (Supabase → SQL Editor → Run).
-- Only adds things; existing ratings are not touched. Safe to run again.

-- One photo per person per drink, tied to that person's rating:
-- removing the rating removes the photo. Images are stored as small JPEG data URLs
-- (the app shrinks them on the phone first), plus a tiny thumbnail for lists.
create table if not exists public.dr_photos (
  user_id    uuid not null,
  drink_id   text not null,
  thumb      text not null check (char_length(thumb) <= 80000),
  data       text not null check (char_length(data) <= 700000),
  created_at timestamptz not null default now(),
  primary key (user_id, drink_id),
  foreign key (user_id, drink_id) references public.dr_ratings (user_id, drink_id) on delete cascade
);
alter table public.dr_photos enable row level security;
revoke all on public.dr_photos from anon, authenticated;

-- Set (or with p_data = null, remove) my photo of a drink I have rated.
create or replace function public.dr_set_photo(p_token uuid, p_drink text, p_thumb text, p_data text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_me dr_users;
begin
  select * into v_me from dr_users where token = p_token;
  if not found then
    return json_build_object('error', 'BAD_TOKEN');
  end if;
  if p_data is null then
    delete from dr_photos where user_id = v_me.id and drink_id = p_drink;
    return json_build_object('ok', true);
  end if;
  if p_data !~ '^data:image/(jpeg|webp);base64,' or coalesce(p_thumb, '') !~ '^data:image/(jpeg|webp);base64,' then
    return json_build_object('error', 'BAD_IMAGE');
  end if;
  if char_length(p_data) > 700000 or char_length(p_thumb) > 80000 then
    return json_build_object('error', 'TOO_BIG');
  end if;
  if not exists (select 1 from dr_ratings where user_id = v_me.id and drink_id = p_drink) then
    return json_build_object('error', 'NO_RATING');
  end if;
  insert into dr_photos (user_id, drink_id, thumb, data)
  values (v_me.id, p_drink, p_thumb, p_data)
  on conflict (user_id, drink_id)
  do update set thumb = excluded.thumb, data = excluded.data, created_at = now();
  return json_build_object('ok', true);
end $$;

-- Thumbnails of everyone's photos of one drink.
create or replace function public.dr_drink_photos(p_token uuid, p_drink text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from dr_users where token = p_token) then
    return json_build_object('error', 'BAD_TOKEN');
  end if;
  return coalesce((
    select json_agg(json_build_object('name', u.name, 'thumb', p.thumb, 'at', p.created_at) order by p.created_at desc)
      from dr_photos p join dr_users u on u.id = p.user_id
     where p.drink_id = p_drink), '[]'::json);
end $$;

-- One full-size photo.
create or replace function public.dr_photo(p_token uuid, p_drink text, p_name text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_data text;
begin
  if not exists (select 1 from dr_users where token = p_token) then
    return json_build_object('error', 'BAD_TOKEN');
  end if;
  select p.data into v_data
    from dr_photos p join dr_users u on u.id = p.user_id
   where p.drink_id = p_drink and u.name_key = lower(btrim(p_name));
  return json_build_object('data', v_data);
end $$;

-- The newest photo thumbnails from the whole family.
create or replace function public.dr_recent_photos(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from dr_users where token = p_token) then
    return json_build_object('error', 'BAD_TOKEN');
  end if;
  return coalesce((
    select json_agg(x) from (
      select json_build_object('drink', p.drink_id, 'name', u.name, 'thumb', p.thumb, 'at', p.created_at) as x
        from dr_photos p join dr_users u on u.id = p.user_id
       order by p.created_at desc
       limit 30) t), '[]'::json);
end $$;

-- Ratings now say whether they have a photo.
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
               'drink', r.drink_id, 'name', u.name, 'score', r.score, 'bar', r.bar,
               'comment', r.comment, 'at', r.updated_at,
               'photo', exists (select 1 from dr_photos p where p.user_id = r.user_id and p.drink_id = r.drink_id))
               order by r.updated_at desc)
        from dr_ratings r join dr_users u on u.id = r.user_id), '[]'::json));
end $$;

revoke all on function public.dr_set_photo(uuid, text, text, text), public.dr_drink_photos(uuid, text),
  public.dr_photo(uuid, text, text), public.dr_recent_photos(uuid) from public;
grant execute on function public.dr_set_photo(uuid, text, text, text), public.dr_drink_photos(uuid, text),
  public.dr_photo(uuid, text, text), public.dr_recent_photos(uuid), public.dr_get_ratings(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
