-- Helpers, match rule, triggers, row level security, grants, realtime.

-- ---------------------------------------------------------------- helpers
-- SECURITY DEFINER so RLS policies can use them without recursing into profiles.

create function private.my_couple_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select couple_id from public.profiles where id = auth.uid()
$$;

create function private.my_email() returns text
language sql stable security definer set search_path = '' as $$
  select email from public.profiles where id = auth.uid()
$$;

create function private.partner_id(p_user uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select p2.id
  from public.profiles p1
  join public.profiles p2 on p2.couple_id = p1.couple_id and p2.id <> p1.id
  where p1.id = p_user
$$;

create function private.require_uid() returns uuid
language plpgsql stable set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  return auth.uid();
end $$;

-- Explicit exclusions plus all descendants. Mirrors expandExclusions() in src/logic.
create function private.excluded_ingredient_ids(p_user uuid) returns setof bigint
language sql stable security definer set search_path = '' as $$
  with recursive ex (id) as (
    select ingredient_id from public.user_excluded_ingredients where user_id = p_user
    union
    select i.id from public.ingredients i join ex on i.parent_id = ex.id
  )
  select id from ex
$$;

-- True if no ingredient of the recipe is excluded by any of the users.
create function private.recipe_ok_for(p_users uuid[], p_recipe bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1
    from public.recipe_ingredients ri
    join unnest(p_users) u (id) on true
    join lateral private.excluded_ingredient_ids(u.id) x (id) on x.id = ri.ingredient_id
    where ri.recipe_id = p_recipe
  )
$$;

-- ------------------------------------------------------------ match rule
-- Mirrors isMatch() in src/logic/match.ts: change both together.
create function private.is_match(p_a uuid, p_b uuid, p_recipe bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_a <> p_b
    and exists (select 1 from public.swipes s
                where s.user_id = p_a and s.recipe_id = p_recipe and s.context = 'discover' and s.liked)
    and exists (select 1 from public.swipes s
                where s.user_id = p_b and s.recipe_id = p_recipe and s.context = 'discover' and s.liked)
    and private.recipe_ok_for(array[p_a, p_b], p_recipe)
$$;

-- Creates every missing match for a couple (retroactive matching). Never deletes;
-- an existing row (including a user-removed one) is left as is.
create function private.refresh_matches(p_couple uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  members uuid[];
  n integer;
begin
  select array_agg(id) into members from public.profiles where couple_id = p_couple;
  if coalesce(cardinality(members), 0) <> 2 then
    return 0;
  end if;
  insert into public.matches (couple_id, recipe_id)
  select p_couple, s.recipe_id
  from public.swipes s
  where s.user_id = members[1] and s.context = 'discover' and s.liked
    and private.is_match(members[1], members[2], s.recipe_id)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------- triggers

-- Every auth user gets a profile. Name comes from sign-up metadata.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
                  split_part(new.email, '@', 1)), 40),
    lower(btrim(new.email))
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- A couple has at most 2 members.
create function private.enforce_couple_size() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.couple_id is not null and (
    select count(*) from public.profiles where couple_id = new.couple_id and id <> new.id
  ) >= 2 then
    raise exception 'couple_full';
  end if;
  return new;
end $$;

create trigger profiles_couple_size
  before insert or update of couple_id on public.profiles
  for each row execute function private.enforce_couple_size();

-- A new discover like may complete a match.
create function private.on_discover_like() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c uuid;
  partner uuid;
begin
  select couple_id into c from public.profiles where id = new.user_id;
  partner := private.partner_id(new.user_id);
  if c is not null and partner is not null and private.is_match(new.user_id, partner, new.recipe_id) then
    insert into public.matches (couple_id, recipe_id) values (c, new.recipe_id)
    on conflict do nothing;
  end if;
  return null;
end $$;

create trigger swipes_discover_like
  after insert on public.swipes
  for each row when (new.context = 'discover' and new.liked)
  execute function private.on_discover_like();

-- Removing exclusions can create matches retroactively (adding never creates any).
create function private.on_exclusions_removed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.refresh_matches(x.couple_id)
  from (
    select distinct p.couple_id
    from old_rows o join public.profiles p on p.id = o.user_id
    where p.couple_id is not null
  ) x;
  return null;
end $$;

create trigger exclusions_removed
  after delete on public.user_excluded_ingredients
  referencing old table as old_rows
  for each statement execute function private.on_exclusions_removed();

-- ------------------------------------------------------------------ views

-- Matches the couple should see now: not removed, and compatible with both
-- partners' *current* exclusions.
create view public.visible_matches with (security_invoker = true) as
select m.couple_id, m.recipe_id, m.created_at
from public.matches m
where m.removed_at is null
  and private.recipe_ok_for(
    array(select p.id from public.profiles p where p.couple_id = m.couple_id),
    m.recipe_id
  );

-- --------------------------------------------------------------------- RLS

alter table public.couples enable row level security;
alter table public.profiles enable row level security;
alter table public.pairing_codes enable row level security;
alter table public.pairing_invites enable row level security;
alter table public.ingredients enable row level security;
alter table public.user_excluded_ingredients enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.tonight_sessions enable row level security;
alter table public.tonight_participants enable row level security;
alter table public.tonight_rankings enable row level security;
alter table public.swipes enable row level security;
alter table public.matches enable row level security;

create policy "own and partner profile" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (couple_id is not null and couple_id = (select private.my_couple_id())));
create policy "edit own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "own couple" on public.couples for select to authenticated
  using (id = (select private.my_couple_id()));

create policy "own codes" on public.pairing_codes for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "sent or received invites" on public.pairing_invites for select to authenticated
  using (from_user_id = (select auth.uid()) or to_email = (select private.my_email()));

create policy "read ingredients" on public.ingredients for select to authenticated using (true);
create policy "read recipes" on public.recipes for select to authenticated using (true);
create policy "read recipe ingredients" on public.recipe_ingredients for select to authenticated using (true);

create policy "own and partner exclusions" on public.user_excluded_ingredients for select to authenticated
  using (user_id = (select auth.uid()) or user_id = (select private.partner_id(auth.uid())));
create policy "add own exclusions" on public.user_excluded_ingredients for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "remove own exclusions" on public.user_excluded_ingredients for delete to authenticated
  using (user_id = (select auth.uid()));

-- Partner's discover swipes are readable: the deck mixes in partner-liked recipes.
create policy "own and partner discover swipes" on public.swipes for select to authenticated
  using (user_id = (select auth.uid())
         or (context = 'discover' and user_id = (select private.partner_id(auth.uid()))));

create policy "couple matches" on public.matches for select to authenticated
  using (couple_id = (select private.my_couple_id()));

create policy "couple sessions" on public.tonight_sessions for select to authenticated
  using (couple_id = (select private.my_couple_id()));
create policy "couple participants" on public.tonight_participants for select to authenticated
  using (session_id in (select id from public.tonight_sessions where couple_id = (select private.my_couple_id())));
create policy "couple rankings" on public.tonight_rankings for select to authenticated
  using (session_id in (select id from public.tonight_sessions where couple_id = (select private.my_couple_id())));

-- ------------------------------------------------------------------ grants
-- Clients read through RLS and change membership/match state only via RPCs.
-- The only direct writes: own display_name and own exclusions.

revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
grant insert, delete on public.user_excluded_ingredients to authenticated;
grant update (display_name) on public.profiles to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
-- Needed by RLS policies and visible_matches, which run as the calling user.
grant execute on function private.my_couple_id(), private.my_email(), private.partner_id(uuid),
  private.recipe_ok_for(uuid[], bigint), private.excluded_ingredient_ids(uuid)
  to authenticated;

-- --------------------------------------------------------------- realtime
alter publication supabase_realtime add table
  public.profiles, public.pairing_invites, public.matches,
  public.tonight_sessions, public.tonight_participants;
