-- Weekly meal plan. Stages: setup → choosing (re-swipe) → generated → accepted.
-- Phones compute the selection, the plan and every edit with src/logic/week.ts and
-- plan.ts; these RPCs check membership, dates, stages and that only shared matches
-- go in. Dates are the phone's local date (p_today), accepted within a day of the
-- server's.

create table public.week_plans (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  first_day date not null check (first_day between week_start and week_start + 6),
  created_on date not null,
  status text not null default 'setup' check (status in ('setup', 'choosing', 'generated', 'accepted')),
  leftovers integer not null default 3 check (leftovers between 0 and 7),
  -- This week's re-swipe selection (same for both partners), in card order.
  picks bigint[] not null default '{}',
  started_by uuid not null references public.profiles (id) on delete cascade,
  generated_by uuid references public.profiles (id) on delete set null,
  generated_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  -- One plan per week: both partners starting at once join the same one.
  unique (couple_id, week_start)
);

-- A row = a switched-on slot. Leftovers aren't stored: a dish planned twice,
-- 1–2 days apart, is a leftover pair (leftoverPairs() in src/logic/plan.ts).
create table public.week_plan_slots (
  plan_id uuid not null references public.week_plans (id) on delete cascade,
  day date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'snack', 'dinner')),
  recipe_id bigint references public.recipes (id) on delete set null,
  locked boolean not null default false,
  note text check (note in ('nothing_matched', 'cleared', 'leftover_removed', 'no_longer_leftover',
                            'partner_passed', 'eaten_tonight')),
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz,
  primary key (plan_id, day, meal)
);

create table public.week_plan_members (
  plan_id uuid not null references public.week_plans (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reswipe_done boolean not null default false,
  -- When this partner last opened the plan ("Changed by" markers are newer changes).
  seen_at timestamptz,
  primary key (plan_id, user_id)
);

-- This week's re-swipe. A rejection applies to this week only; the match stays.
create table public.week_plan_swipes (
  plan_id uuid not null references public.week_plans (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  recipe_id bigint not null references public.recipes (id) on delete cascade,
  liked boolean not null,
  created_at timestamptz not null default now(),
  primary key (plan_id, user_id, recipe_id)
);

-- "Not good for leftovers", remembered for all later weeks.
create table public.couple_no_leftovers (
  couple_id uuid not null references public.couples (id) on delete cascade,
  recipe_id bigint not null references public.recipes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (couple_id, recipe_id)
);

-- --------------------------------------------------------------------- RLS

alter table public.week_plans enable row level security;
alter table public.week_plan_slots enable row level security;
alter table public.week_plan_members enable row level security;
alter table public.week_plan_swipes enable row level security;
alter table public.couple_no_leftovers enable row level security;

create policy "couple plans" on public.week_plans for select to authenticated
  using (couple_id = (select private.my_couple_id()));
create policy "couple plan slots" on public.week_plan_slots for select to authenticated
  using (plan_id in (select id from public.week_plans where couple_id = (select private.my_couple_id())));
create policy "couple plan members" on public.week_plan_members for select to authenticated
  using (plan_id in (select id from public.week_plans where couple_id = (select private.my_couple_id())));
create policy "couple plan swipes" on public.week_plan_swipes for select to authenticated
  using (plan_id in (select id from public.week_plans where couple_id = (select private.my_couple_id())));
create policy "couple no leftovers" on public.couple_no_leftovers for select to authenticated
  using (couple_id = (select private.my_couple_id()));

-- Read-only for clients; every change goes through the RPCs below.
revoke all on public.week_plans, public.week_plan_slots, public.week_plan_members,
  public.week_plan_swipes, public.couple_no_leftovers from anon, authenticated;
grant select on public.week_plans, public.week_plan_slots, public.week_plan_members,
  public.week_plan_swipes, public.couple_no_leftovers to authenticated;

alter publication supabase_realtime add table
  public.week_plans, public.week_plan_slots, public.week_plan_members, public.couple_no_leftovers;

-- ----------------------------------------------------------------- helpers

create function private.check_today(p_today date) returns date
language plpgsql stable set search_path = '' as $$
begin
  if p_today is null or abs(p_today - current_date) > 1 then
    raise exception 'plan_bad_date';
  end if;
  return p_today;
end $$;

-- The caller's plan, locked; fails if it isn't their couple's.
create function private.week_plan(p_plan uuid) returns public.week_plans
language plpgsql security definer set search_path = '' as $$
declare
  s public.week_plans;
begin
  perform private.require_uid();
  select * into s from public.week_plans
  where id = p_plan and couple_id = private.my_couple_id()
  for update;
  if not found then raise exception 'plan_not_found'; end if;
  return s;
end $$;

-- Mirrors planPhase() = 'gone' in src/logic/week.ts: change both together.
-- The week ended, or it was never generated and its first day came.
create function private.cleanup_week_plans(p_couple uuid, p_today date) returns void
language sql security definer set search_path = '' as $$
  delete from public.week_plans
  where couple_id = p_couple
    and (week_start + 6 < p_today
         or (status in ('setup', 'choosing')
             and (first_day < p_today or (first_day = p_today and created_on < p_today))))
$$;

-- Same rule as the visible_matches view.
create function private.is_visible_match(p_couple uuid, p_recipe bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.matches m
                 where m.couple_id = p_couple and m.recipe_id = p_recipe and m.removed_at is null)
    and private.recipe_ok_for(array(select p.id from public.profiles p where p.couple_id = p_couple), p_recipe)
$$;

-- --------------------------------------------------------------------- RPCs

-- Deletes the couple's plans that are over (no history is kept).
create function public.plan_cleanup(p_today date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c uuid := private.my_couple_id();
begin
  perform private.require_uid();
  if c is not null then
    perform private.cleanup_week_plans(c, private.check_today(p_today));
  end if;
end $$;

-- Starts next week's plan (p_first_day = next Monday) or the rest of this week
-- (p_first_day = today), or joins the one that already exists for that week.
-- Lunch and dinner are switched on for every day.
create function public.plan_start(p_first_day date, p_today date) returns json
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_uid();
  c uuid := private.my_couple_id();
  t date := private.check_today(p_today);
  this_monday date := t - (extract(isodow from t)::int - 1);
  ws date := p_first_day - (extract(isodow from p_first_day)::int - 1);
  v uuid;
begin
  if c is null then raise exception 'not_paired'; end if;
  if not ((ws = this_monday and p_first_day = t) or (ws = this_monday + 7 and p_first_day = ws)) then
    raise exception 'plan_bad_date';
  end if;
  perform private.cleanup_week_plans(c, t);

  select id into v from public.week_plans where couple_id = c and week_start = ws;
  if v is not null then return json_build_object('id', v, 'joined', true); end if;

  insert into public.week_plans (couple_id, week_start, first_day, created_on, started_by)
  values (c, ws, p_first_day, t, me) returning id into v;
  insert into public.week_plan_members (plan_id, user_id)
  select v, id from public.profiles where couple_id = c;
  insert into public.week_plan_slots (plan_id, day, meal)
  select v, d::date, m
  from generate_series(p_first_day, ws + 6, interval '1 day') d
  cross join unnest(array['lunch', 'dinner']) m;
  return json_build_object('id', v, 'joined', false);
exception when unique_violation then
  -- Both started at the same moment: join the other one.
  select id into v from public.week_plans where couple_id = c and week_start = ws;
  return json_build_object('id', v, 'joined', true);
end $$;

-- Which days × meals to plan: [{day, meal}], replacing the current set. Setup only.
create function public.plan_setup(p_plan uuid, p_cells jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.week_plans := private.week_plan(p_plan);
begin
  if s.status <> 'setup' then raise exception 'plan_wrong_stage'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_cells) x (day date, meal text)
    where x.day is null or x.day < s.first_day or x.day > s.week_start + 6
       or x.meal is null or x.meal not in ('breakfast', 'lunch', 'snack', 'dinner')
  ) then
    raise exception 'plan_bad_cells';
  end if;
  delete from public.week_plan_slots where plan_id = p_plan;
  insert into public.week_plan_slots (plan_id, day, meal)
  select distinct p_plan, x.day, x.meal from jsonb_to_recordset(p_cells) x (day date, meal text);
end $$;

create function public.plan_set_leftovers(p_plan uuid, p_leftovers integer) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.week_plans := private.week_plan(p_plan);
begin
  if p_leftovers is null or p_leftovers < 0 or p_leftovers > 7 then raise exception 'plan_bad_leftovers'; end if;
  update public.week_plans set leftovers = p_leftovers where id = s.id;
end $$;

-- Setup → choosing with this week's selection (computed on the phone, at most 30).
-- Only the first call applies (returns true). Ids that aren't visible matches are dropped.
create function public.plan_begin_choosing(p_plan uuid, p_picks bigint[]) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  s public.week_plans := private.week_plan(p_plan);
begin
  if s.status <> 'setup' then return false; end if;
  if not exists (select 1 from public.week_plan_slots where plan_id = p_plan) then
    raise exception 'plan_no_slots';
  end if;
  if cardinality(p_picks) > 30 then raise exception 'plan_bad_picks'; end if;
  update public.week_plans
  set status = 'choosing',
      picks = coalesce((
        select array_agg(u.id order by u.n)
        from unnest(p_picks) with ordinality u (id, n)
        where private.is_visible_match(s.couple_id, u.id)), '{}')
  where id = p_plan;
  return true;
end $$;

-- A re-swipe of one of this week's picks. After the partner generated the plan,
-- swipes this phone made before it saw the plan still count: a late rejection
-- empties the dish's (unlocked, not past) slots with "[Name] passed on this".
create function public.plan_reswipe(p_plan uuid, p_recipe_id bigint, p_liked boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_uid();
  s public.week_plans := private.week_plan(p_plan);
  done boolean;
begin
  if not (p_recipe_id = any (s.picks)) then raise exception 'plan_not_in_selection'; end if;
  select reswipe_done into done from public.week_plan_members where plan_id = p_plan and user_id = me;
  if not (s.status = 'choosing' or (s.status in ('generated', 'accepted') and not done)) then
    raise exception 'plan_wrong_stage';
  end if;
  insert into public.week_plan_swipes (plan_id, user_id, recipe_id, liked)
  values (p_plan, me, p_recipe_id, p_liked)
  on conflict do nothing;
  if not p_liked and s.status in ('generated', 'accepted') then
    update public.week_plan_slots
    set recipe_id = null, note = 'partner_passed', changed_by = me, changed_at = now()
    where plan_id = p_plan and recipe_id = p_recipe_id and not locked and day >= current_date;
  end if;
end $$;

-- Undoes my most recent re-swipe this week. Returns its recipe id.
create function public.plan_undo_reswipe(p_plan uuid) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_uid();
  s public.week_plans := private.week_plan(p_plan);
  r bigint;
begin
  if s.status <> 'choosing' then raise exception 'plan_wrong_stage'; end if;
  delete from public.week_plan_swipes
  where (plan_id, user_id, recipe_id) = (
    select plan_id, user_id, recipe_id from public.week_plan_swipes
    where plan_id = p_plan and user_id = me
    order by created_at desc
    limit 1)
  returning recipe_id into r;
  if r is null then raise exception 'nothing_to_undo'; end if;
  return r;
end $$;

-- "Enough — plan with these", or the swiping ended because the partner generated.
create function public.plan_finish_reswipe(p_plan uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_uid();
  s public.week_plans := private.week_plan(p_plan);
begin
  update public.week_plan_members set reswipe_done = true where plan_id = s.id and user_id = me;
end $$;

-- Saves slots: [{day, meal, recipe_id, locked, note}]. Each saved slot shows who
-- changed it. p_generate: Generate/Regenerate, which moves `choosing` to
-- `generated`, never touches a locked slot and uses only this week's picks that
-- nobody rejected. Otherwise a manual edit, which may use any visible match.
create function public.plan_write_slots(p_plan uuid, p_slots jsonb, p_generate boolean, p_today date)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_uid();
  s public.week_plans := private.week_plan(p_plan);
  t date := private.check_today(p_today);
  r record;
  cur public.week_plan_slots;
begin
  if (p_generate and s.status not in ('choosing', 'generated', 'accepted'))
     or (not p_generate and s.status not in ('generated', 'accepted')) then
    raise exception 'plan_wrong_stage';
  end if;

  for r in select * from jsonb_to_recordset(p_slots) x (day date, meal text, recipe_id bigint, locked boolean, note text)
  loop
    select * into cur from public.week_plan_slots
    where plan_id = p_plan and day = r.day and meal = r.meal
    for update;
    if not found then raise exception 'plan_bad_cells'; end if;
    if r.day < t then raise exception 'plan_past_day'; end if;
    if p_generate and cur.locked then raise exception 'plan_slot_locked'; end if;
    if r.recipe_id is not null and r.recipe_id is distinct from cur.recipe_id then
      if not private.is_visible_match(s.couple_id, r.recipe_id) then raise exception 'plan_not_a_match'; end if;
      if p_generate and (not (r.recipe_id = any (s.picks)) or exists (
        select 1 from public.week_plan_swipes w
        where w.plan_id = p_plan and w.recipe_id = r.recipe_id and not w.liked)) then
        raise exception 'plan_rejected';
      end if;
    end if;
    update public.week_plan_slots
    set recipe_id = r.recipe_id,
        locked = case when p_generate then cur.locked else coalesce(r.locked, cur.locked) end,
        note = r.note,
        changed_by = me,
        changed_at = now()
    where plan_id = p_plan and day = r.day and meal = r.meal;
  end loop;

  if p_generate then
    update public.week_plans
    set status = case when status = 'choosing' then 'generated' else status end,
        generated_by = me,
        generated_at = now()
    where id = p_plan;
  end if;
end $$;

-- "Use this plan": either partner alone.
create function public.plan_accept(p_plan uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_uid();
  s public.week_plans := private.week_plan(p_plan);
begin
  if s.status = 'accepted' then return; end if;
  if s.status <> 'generated' then raise exception 'plan_wrong_stage'; end if;
  update public.week_plans set status = 'accepted', accepted_by = me, accepted_at = now() where id = p_plan;
end $$;

-- I opened the plan: returns when I last did (null = never), then records now.
create function public.plan_mark_seen(p_plan uuid) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_uid();
  s public.week_plans := private.week_plan(p_plan);
  prev timestamptz;
begin
  select seen_at into prev from public.week_plan_members where plan_id = s.id and user_id = me;
  update public.week_plan_members set seen_at = now() where plan_id = s.id and user_id = me;
  return prev;
end $$;

create function public.plan_delete(p_plan uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.week_plans := private.week_plan(p_plan);
begin
  delete from public.week_plans where id = s.id;
end $$;

-- "Not good for leftovers" (p_ok = false) / "Good for leftovers again" (true).
create function public.set_leftovers_ok(p_recipe_id bigint, p_ok boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c uuid := private.my_couple_id();
begin
  perform private.require_uid();
  if c is null then raise exception 'not_paired'; end if;
  if p_ok then
    delete from public.couple_no_leftovers where couple_id = c and recipe_id = p_recipe_id;
  else
    insert into public.couple_no_leftovers (couple_id, recipe_id) values (c, p_recipe_id)
    on conflict do nothing;
  end if;
end $$;

-- Unpairing now also deletes the couple's plans and leftover marks.
create or replace function public.unpair() returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_uid();
  c uuid;
begin
  select couple_id into c from public.profiles where id = me;
  if c is null then raise exception 'not_paired'; end if;
  perform 1 from public.profiles where couple_id = c order by id for update;

  update public.tonight_sessions set status = 'cancelled', completed_at = now()
  where couple_id = c and status in ('swiping', 'choosing', 'shortlisting', 'ranking');
  delete from public.matches where couple_id = c;
  delete from public.week_plans where couple_id = c;
  delete from public.couple_no_leftovers where couple_id = c;
  update public.profiles set couple_id = null where couple_id = c;
  update public.couples set dissolved_at = now() where id = c;
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function private.check_today(date), private.week_plan(uuid),
  private.cleanup_week_plans(uuid, date), private.is_visible_match(uuid, bigint)
  from public, anon, authenticated;
revoke execute on function
  public.plan_cleanup(date), public.plan_start(date, date), public.plan_setup(uuid, jsonb),
  public.plan_set_leftovers(uuid, integer), public.plan_begin_choosing(uuid, bigint[]),
  public.plan_reswipe(uuid, bigint, boolean), public.plan_undo_reswipe(uuid), public.plan_finish_reswipe(uuid),
  public.plan_write_slots(uuid, jsonb, boolean, date), public.plan_accept(uuid), public.plan_mark_seen(uuid),
  public.plan_delete(uuid), public.set_leftovers_ok(bigint, boolean)
  from public, anon;
grant execute on function
  public.plan_cleanup(date), public.plan_start(date, date), public.plan_setup(uuid, jsonb),
  public.plan_set_leftovers(uuid, integer), public.plan_begin_choosing(uuid, bigint[]),
  public.plan_reswipe(uuid, bigint, boolean), public.plan_undo_reswipe(uuid), public.plan_finish_reswipe(uuid),
  public.plan_write_slots(uuid, jsonb, boolean, date), public.plan_accept(uuid), public.plan_mark_seen(uuid),
  public.plan_delete(uuid), public.set_leftovers_ok(bigint, boolean)
  to authenticated;
