-- Advanced recipe filters and "Do not eat" marks (grooming package advanced-recipe-filters, run 1).
-- Each partner's settings are private: only the owner can read them. Matching needs both
-- partners' settings, so the partner's effect comes from partner_blocked_recipes(), which
-- returns recipe ids without saying which filter or mark caused them.

-- Estimated by the seed script (estimateDifficulty in src/logic/recipes.ts).
alter table public.recipes
  add column difficulty text check (difficulty in ('easy', 'medium', 'hard'));

create table public.user_recipe_filters (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  max_minutes integer check (max_minutes in (15, 30, 45, 60, 90, 120)),
  difficulties text[] not null default '{}' check (difficulties <@ array['easy', 'medium', 'hard']),
  cuisines text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.user_hidden_recipes (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  recipe_id bigint not null references public.recipes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

-- --------------------------------------------------------------------- RLS
-- Own rows only (unlike exclusions, the partner can't read them). Direct client
-- writes are fine: these never change couple membership or match state.

alter table public.user_recipe_filters enable row level security;
alter table public.user_hidden_recipes enable row level security;

create policy "own filters" on public.user_recipe_filters for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own hidden recipes" on public.user_hidden_recipes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.user_recipe_filters, public.user_hidden_recipes from anon, authenticated;
grant select, insert, update, delete on public.user_recipe_filters to authenticated;
grant select, insert, delete on public.user_hidden_recipes to authenticated;

-- ----------------------------------------------------------------- the rule
-- Mirrors blockedForMatching()/passesFilters() in src/logic/filters.ts: change both together.
-- A recipe with no cook time fails any max time; no difficulty/cuisine passes that filter.
create function private.blocked_recipe_ids(p_user uuid) returns setof bigint
language sql stable security definer set search_path = '' as $$
  select h.recipe_id from public.user_hidden_recipes h where h.user_id = p_user
  union
  select r.id
  from public.recipes r
  join public.user_recipe_filters f on f.user_id = p_user
  where (f.max_minutes is not null and (r.cook_time_min is null or r.cook_time_min > f.max_minutes))
     or (cardinality(f.difficulties) > 0 and r.difficulty is not null and not r.difficulty = any (f.difficulties))
     or (cardinality(f.cuisines) > 0 and r.cuisine is not null and not r.cuisine = any (f.cuisines))
$$;

-- Recipes my partner's filters or marks block. Empty when unpaired.
create function public.partner_blocked_recipes() returns setof bigint
language plpgsql stable security definer set search_path = '' as $$
declare
  partner uuid := private.partner_id(private.require_uid());
begin
  if partner is not null then
    return query select private.blocked_recipe_ids(partner);
  end if;
end $$;

revoke all on function private.blocked_recipe_ids(uuid) from public, anon, authenticated;
revoke execute on function public.partner_blocked_recipes() from public, anon;
grant execute on function public.partner_blocked_recipes() to authenticated;
