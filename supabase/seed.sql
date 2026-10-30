-- Local development seed: 3 users and 1 group (phase 4 work item 1).
-- Password for all three accounts is "password123". These rows exist only in the local
-- Supabase stack; the seed is never pushed to a remote project.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000', 'a1a1a1a1-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'alice@example.com', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Alice"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'b1b1b1b1-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'bob@example.com', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Bob"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c1c1c1c1-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'carol@example.com', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Carol"}', now(), now(), '', '', '', '');

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.email in ('alice@example.com', 'bob@example.com', 'carol@example.com');

-- 0003's trigger already created these rows from the auth.users insert above, with the same usernames
-- (it derives them from the email local part). This upsert exists so the seed states the profile state
-- it wants instead of inheriting whatever the trigger chose.
insert into profiles (id, username, display_name, role) values
  ('a1a1a1a1-0000-4000-8000-000000000001', 'alice', 'Alice', 'learner'),
  ('b1b1b1b1-0000-4000-8000-000000000002', 'bob',   'Bob',   'learner'),
  ('c1c1c1c1-0000-4000-8000-000000000003', 'carol', 'Carol', 'learner')
on conflict (id) do update set display_name = excluded.display_name, role = excluded.role;

insert into groups (id, name, owner_id, seats) values
  ('6f6f6f6f-0000-4000-8000-000000000010', 'Northgate Academy',
   'a1a1a1a1-0000-4000-8000-000000000001', 10);

update profiles set group_id = '6f6f6f6f-0000-4000-8000-000000000010', role = 'owner'
  where id = 'a1a1a1a1-0000-4000-8000-000000000001';
update profiles set group_id = '6f6f6f6f-0000-4000-8000-000000000010'
  where id = 'b1b1b1b1-0000-4000-8000-000000000002';
