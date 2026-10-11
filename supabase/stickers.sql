-- DrinkRate: stickers everyone can see. Run after setup.sql (Supabase → SQL Editor → Run).
-- Only adds things; nothing existing is touched. Safe to run again.

create table if not exists public.dr_stickers (
  user_id    uuid not null references public.dr_users(id) on delete cascade,
  sticker    text not null check (sticker ~ '^[a-z0-9]{2,20}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, sticker)
);
alter table public.dr_stickers enable row level security;
revoke all on public.dr_stickers from anon, authenticated;

-- Record that I found a sticker (the first time counts).
create or replace function public.dr_award(p_token uuid, p_sticker text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_me dr_users;
begin
  select * into v_me from dr_users where token = p_token;
  if not found then
    return json_build_object('error', 'BAD_TOKEN');
  end if;
  if coalesce(p_sticker, '') !~ '^[a-z0-9]{2,20}$' then
    return json_build_object('error', 'BAD_STICKER');
  end if;
  insert into dr_stickers (user_id, sticker) values (v_me.id, p_sticker)
  on conflict do nothing;
  return json_build_object('ok', true);
end $$;

-- Everyone's stickers.
create or replace function public.dr_get_stickers(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from dr_users where token = p_token) then
    return json_build_object('error', 'BAD_TOKEN');
  end if;
  return coalesce((
    select json_agg(json_build_object('name', u.name, 'sticker', s.sticker, 'at', s.created_at) order by s.created_at)
      from dr_stickers s join dr_users u on u.id = s.user_id), '[]'::json);
end $$;

revoke all on function public.dr_award(uuid, text), public.dr_get_stickers(uuid) from public;
grant execute on function public.dr_award(uuid, text), public.dr_get_stickers(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
