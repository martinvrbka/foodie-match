-- Shared recipe filters (grooming package ux-simplification, run 1: DL-002, DL-009, DL-012).
-- A paired couple has one set of filters: a change by either partner applies to both
-- right away. Unpaired users keep their own row in user_recipe_filters. "Do not eat"
-- marks stay private to each partner (user_hidden_recipes is unchanged).

create table public.couple_recipe_filters (
  couple_id uuid primary key references public.couples (id) on delete cascade,
  max_minutes integer check (max_minutes in (15, 30, 45, 60, 90, 120)),
  difficulties text[] not null default '{}' check (difficulties <@ array['easy', 'medium', 'hard']),
  cuisines text[] not null default '{}',
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Both partners read it (and get realtime updates); writes go through set_recipe_filters().
alter table public.couple_recipe_filters enable row level security;
create policy "couple filters" on public.couple_recipe_filters for select to authenticated
  using (couple_id = (select private.my_couple_id()));
revoke all on public.couple_recipe_filters from anon, authenticated;
grant select on public.couple_recipe_filters to authenticated;

alter publication supabase_realtime add table public.couple_recipe_filters;

-- DL-012: after the update no filters are on; both set them again.
delete from public.user_recipe_filters;

-- ----------------------------------------------------------------- the rule
-- The filters that apply to a user: the couple's when paired, their own otherwise.
create function private.filters_for(p_user uuid)
returns table (max_minutes integer, difficulties text[], cuisines text[])
language sql stable security definer set search_path = '' as $$
  select c.max_minutes, c.difficulties, c.cuisines
  from public.profiles p
  join public.couple_recipe_filters c on c.couple_id = p.couple_id
  where p.id = p_user
  union all
  select u.max_minutes, u.difficulties, u.cuisines
  from public.profiles p
  join public.user_recipe_filters u on u.user_id = p.id
  where p.id = p_user and p.couple_id is null
$$;

-- Mirrors blockedForMatching()/passesFilters() in src/logic/filters.ts: change both together.
-- A recipe with no cook time fails any max time; no difficulty/cuisine passes that filter.
create or replace function private.blocked_recipe_ids(p_user uuid) returns setof bigint
language sql stable security definer set search_path = '' as $$
  select h.recipe_id from public.user_hidden_recipes h where h.user_id = p_user
  union
  select r.id
  from public.recipes r
  cross join private.filters_for(p_user) f
  where (f.max_minutes is not null and (r.cook_time_min is null or r.cook_time_min > f.max_minutes))
     or (cardinality(f.difficulties) > 0 and r.difficulty is not null and not r.difficulty = any (f.difficulties))
     or (cardinality(f.cuisines) > 0 and r.cuisine is not null and not r.cuisine = any (f.cuisines))
$$;

-- ----------------------------------------------------------------- RPCs

-- Recipes my partner's settings block, as one array: a set of rows was cut off at the
-- API's 1000-row limit once enough recipes were blocked. Empty when unpaired.
drop function public.partner_blocked_recipes();
create function public.partner_blocked_recipes() returns bigint[]
language plpgsql stable security definer set search_path = '' as $$
declare
  partner uuid := private.partner_id(private.require_uid());
begin
  if partner is null then
    return '{}';
  end if;
  return array(select private.blocked_recipe_ids(partner));
end $$;

-- The filters that apply to me: {max_minutes, difficulties, cuisines}; none set = no filters.
create function public.get_recipe_filters() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  f record;
begin
  select * into f from private.filters_for(private.require_uid());
  if not found then
    return jsonb_build_object('max_minutes', null, 'difficulties', '[]'::jsonb, 'cuisines', '[]'::jsonb);
  end if;
  return jsonb_build_object('max_minutes', f.max_minutes, 'difficulties', to_jsonb(f.difficulties),
    'cuisines', to_jsonb(f.cuisines));
end $$;

-- Saves the filters for my couple (both partners), or for me alone when unpaired.
create function public.set_recipe_filters(p_max_minutes integer, p_difficulties text[], p_cuisines text[])
returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_uid();
  c uuid := private.my_couple_id();
begin
  if c is not null then
    insert into public.couple_recipe_filters as t (couple_id, max_minutes, difficulties, cuisines, updated_by)
    values (c, p_max_minutes, coalesce(p_difficulties, '{}'), coalesce(p_cuisines, '{}'), me)
    on conflict (couple_id) do update
      set max_minutes = excluded.max_minutes, difficulties = excluded.difficulties,
          cuisines = excluded.cuisines, updated_by = me, updated_at = now();
  else
    insert into public.user_recipe_filters as t (user_id, max_minutes, difficulties, cuisines)
    values (me, p_max_minutes, coalesce(p_difficulties, '{}'), coalesce(p_cuisines, '{}'))
    on conflict (user_id) do update
      set max_minutes = excluded.max_minutes, difficulties = excluded.difficulties,
          cuisines = excluded.cuisines, updated_at = now();
  end if;
end $$;

revoke all on function private.filters_for(uuid) from public, anon, authenticated;
revoke execute on function public.partner_blocked_recipes() from public, anon;
grant execute on function public.partner_blocked_recipes() to authenticated;
revoke execute on function public.get_recipe_filters() from public, anon;
revoke execute on function public.set_recipe_filters(integer, text[], text[]) from public, anon;
grant execute on function public.get_recipe_filters() to authenticated;
grant execute on function public.set_recipe_filters(integer, text[], text[]) to authenticated;
