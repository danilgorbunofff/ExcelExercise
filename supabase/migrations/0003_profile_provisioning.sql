-- Phase 4 work item 3: a profile row exists for every account.
--
-- The policy set in 0002 grants no insert on profiles — onboarding edits a row that is already
-- there — so nothing in the app can create one. Sign-up happens through GoTrue, which inserts into
-- auth.users as `supabase_auth_admin`, a role with no grant on public.profiles. The row therefore
-- has to come from the database itself: a security-definer trigger on auth.users.
--
-- Username is derived from the email local part, made unique by suffixing a counter, because
-- profiles.username is `citext unique not null` and the client picks the final one during
-- onboarding. Case-insensitivity comes from the column type, so `Alice@` and `alice@` collide here.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base      text;
  candidate text;
  n         int := 0;
begin
  base := nullif(regexp_replace(split_part(new.email, '@', 1), '[^a-zA-Z0-9_.-]', '', 'g'), '');
  if base is null or length(base) < 3 then
    -- An address with no usable local part still needs a deterministic, unique handle.
    base := 'learner_' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;
  candidate := base;
  while exists (select 1 from profiles p where p.username = candidate) loop
    n := n + 1;
    candidate := base || n::text;
  end loop;

  insert into profiles (id, username, display_name)
    values (new.id, candidate, nullif(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
