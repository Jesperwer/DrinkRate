-- Synthetic test data for the local test database. Never run this against production.
-- Jesper (PIN 1234) has two old ratings. Astri (4321), Ingvild (5555) and Anne (2222) have
-- accounts but no ratings yet: registration is closed (security_holiday.sql), so the family
-- is set up before the tests start, the same way it must be in production.
insert into dr_users (name, name_key, pin_hash) values
  ('Jesper', 'jesper', extensions.crypt('1234', extensions.gen_salt('bf'))),
  ('Astri', 'astri', extensions.crypt('4321', extensions.gen_salt('bf'))),
  ('Ingvild', 'ingvild', extensions.crypt('5555', extensions.gen_salt('bf')));
insert into dr_ratings (user_id, drink_id, score, bar, comment, updated_at)
select id, 'mojito', 8, 'amph', null, now() - interval '2 days' from dr_users where name_key = 'jesper'
union all
select id, 'coeur-de-lion', 7, null, null, now() - interval '1 day' from dr_users where name_key = 'jesper';
insert into dr_users (name, name_key, pin_hash) values
  ('Anne', 'anne', extensions.crypt('2222', extensions.gen_salt('bf')));
