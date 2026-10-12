-- DrinkRate: close self-registration. Run AFTER setup.sql, photos.sql and stickers.sql
-- (Supabase → SQL Editor → Run), and only once everyone in the family can log in.
-- Only replaces dr_register: users, PINs, tokens, ratings, photos and stickers are not touched.
-- Safe to run again. Running setup.sql again later reopens registration, so run this
-- file again after it.
--
-- New family members after this: Jesper creates them in the SQL Editor, e.g.
--   insert into dr_users (name, name_key, pin_hash)
--   values ('Navn', lower('Navn'), extensions.crypt('1234', extensions.gen_salt('bf')));

-- Same signature as before, so old and new versions of the site keep working.
-- Answers REGISTRATION_CLOSED to everyone and never inserts. The check comes
-- first, so a call with an invalid PIN is a harmless way to see that it is closed.
create or replace function public.dr_register(p_name text, p_pin text)
returns json language plpgsql security definer set search_path = public as $$
begin
  return json_build_object('error', 'REGISTRATION_CLOSED');
end $$;

revoke all on function public.dr_register(text, text) from public;
grant execute on function public.dr_register(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
