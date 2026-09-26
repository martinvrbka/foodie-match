-- Tonight mode. Stages: swiping → (choosing | shortlisting → ranking | ranking | done).
-- Clients compute each next step with src/logic/tonight.ts and call tonight_advance,
-- which applies only the first write for a stage.

alter table public.tonight_sessions drop constraint tonight_sessions_status_check;
alter table public.tonight_sessions add constraint tonight_sessions_status_check
  check (status in ('swiping', 'choosing', 'shortlisting', 'ranking', 'done', 'cancelled'));
drop index public.tonight_sessions_one_active_idx;
create unique index tonight_sessions_one_active_idx on public.tonight_sessions (couple_id)
  where status in ('swiping', 'choosing', 'shortlisting', 'ranking');

-- Recipes to choose from / pick a top 5 from / rank, depending on the stage.
alter table public.tonight_sessions add column shortlist bigint[] not null default '{}';
alter table public.tonight_participants
  add column top_picks bigint[] not null default '{}',
  add column top_done boolean not null default false;

-- Partners can see each other's tonight swipes (the outcome needs both).
create policy "couple tonight swipes" on public.swipes for select to authenticated
  using (context = 'tonight'
         and session_id in (select id from public.tonight_sessions where couple_id = (select private.my_couple_id())));

-- The caller's session, locked; fails if it isn't their couple's.
create function private.tonight_session(p_session uuid) returns public.tonight_sessions
language plpgsql security definer set search_path = '' as $$
declare
  s public.tonight_sessions;
begin
  select * into s from public.tonight_sessions
  where id = p_session and couple_id = private.my_couple_id()
  for update;
  if not found then raise exception 'tonight_not_found'; end if;
  return s;
end $$;

-- Starts a session, or returns the couple's active one (so both join the same).
create function public.start_tonight(p_filters jsonb default '{}') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_uid();
  c uuid := private.my_couple_id();
  v uuid;
begin
  if c is null then raise exception 'not_paired'; end if;
  select id into v from public.tonight_sessions
  where couple_id = c and status in ('swiping', 'choosing', 'shortlisting', 'ranking');
  if v is not null then return v; end if;

  insert into public.tonight_sessions (couple_id, started_by, filters)
  values (c, me, coalesce(p_filters, '{}')) returning id into v;
  insert into public.tonight_participants (session_id, user_id)
  select v, id from public.profiles where couple_id = c;
  return v;
exception when unique_violation then
  -- Both started at the same moment: join the other one.
  select id into v from public.tonight_sessions
  where couple_id = c and status in ('swiping', 'choosing', 'shortlisting', 'ranking');
  return v;
end $$;

create function public.tonight_swipe(p_session uuid, p_recipe_id bigint, p_liked boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_uid();
  s public.tonight_sessions := private.tonight_session(p_session);
begin
  if s.status <> 'swiping' then raise exception 'tonight_wrong_stage'; end if;
  insert into public.swipes (user_id, recipe_id, context, session_id, liked)
  values (me, p_recipe_id, 'tonight', p_session, p_liked)
  on conflict do nothing;
end $$;

-- Returns true when both partners have finished swiping.
create function public.tonight_finish_swiping(p_session uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_uid();
  s public.tonight_sessions := private.tonight_session(p_session);
begin
  if s.status <> 'swiping' then raise exception 'tonight_wrong_stage'; end if;
  update public.tonight_participants set swipe_done = true where session_id = p_session and user_id = me;
  return not exists (select 1 from public.tonight_participants where session_id = p_session and not swipe_done);
end $$;

-- My top 5 (or fewer if the shortlist is shorter), from the shortlist.
create function public.tonight_submit_top(p_session uuid, p_recipe_ids bigint[]) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_uid();
  s public.tonight_sessions := private.tonight_session(p_session);
begin
  if s.status <> 'shortlisting' then raise exception 'tonight_wrong_stage'; end if;
  if cardinality(p_recipe_ids) <> least(5, cardinality(s.shortlist))
     or not (p_recipe_ids <@ s.shortlist)
     or cardinality(array(select distinct unnest(p_recipe_ids))) <> cardinality(p_recipe_ids) then
    raise exception 'tonight_bad_picks';
  end if;
  update public.tonight_participants set top_picks = p_recipe_ids, top_done = true
  where session_id = p_session and user_id = me;
  return not exists (select 1 from public.tonight_participants where session_id = p_session and not top_done);
end $$;

-- My order of preference: every shortlist recipe exactly once, best first.
create function public.tonight_submit_ranking(p_session uuid, p_recipe_ids bigint[]) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_uid();
  s public.tonight_sessions := private.tonight_session(p_session);
begin
  if s.status <> 'ranking' then raise exception 'tonight_wrong_stage'; end if;
  if cardinality(p_recipe_ids) <> cardinality(s.shortlist)
     or not (p_recipe_ids <@ s.shortlist and s.shortlist <@ p_recipe_ids) then
    raise exception 'tonight_bad_ranking';
  end if;
  delete from public.tonight_rankings where session_id = p_session and user_id = me;
  insert into public.tonight_rankings (session_id, user_id, recipe_id, rank)
  select p_session, me, r.id, r.n from unnest(p_recipe_ids) with ordinality as r (id, n);
  update public.tonight_participants set rank_done = true where session_id = p_session and user_id = me;
  return not exists (select 1 from public.tonight_participants where session_id = p_session and not rank_done);
end $$;

-- Moves the session on. Only the first call for a stage applies (returns true);
-- later calls from the other phone return false.
create function public.tonight_advance(
  p_session uuid, p_from text, p_to text, p_shortlist bigint[] default null, p_winner bigint default null
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  s public.tonight_sessions := private.tonight_session(p_session);
begin
  perform private.require_uid();
  if s.status <> p_from then return false; end if;
  if not ((p_from = 'swiping' and p_to in ('choosing', 'shortlisting', 'ranking', 'done'))
       or (p_from = 'shortlisting' and p_to = 'ranking')
       or (p_from = 'ranking' and p_to = 'done')
       or (p_from = 'choosing' and p_to = 'done')) then
    raise exception 'tonight_bad_transition';
  end if;
  if (p_from = 'swiping' and exists (select 1 from public.tonight_participants where session_id = p_session and not swipe_done))
     or (p_from = 'shortlisting' and exists (select 1 from public.tonight_participants where session_id = p_session and not top_done))
     or (p_from = 'ranking' and exists (select 1 from public.tonight_participants where session_id = p_session and not rank_done)) then
    raise exception 'tonight_not_finished';
  end if;
  if p_to = 'done' and p_winner is null then raise exception 'tonight_no_winner'; end if;
  if p_to = 'done' and p_from in ('choosing', 'ranking') and not (p_winner = any (s.shortlist)) then
    raise exception 'tonight_no_winner';
  end if;

  update public.tonight_sessions
  set status = p_to,
      shortlist = coalesce(p_shortlist, shortlist),
      winner_recipe_id = case when p_to = 'done' then p_winner end,
      completed_at = case when p_to = 'done' then now() end
  where id = p_session;
  return true;
end $$;

create function public.cancel_tonight(p_session uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.tonight_sessions := private.tonight_session(p_session);
begin
  perform private.require_uid();
  if s.status not in ('swiping', 'choosing', 'shortlisting', 'ranking') then return; end if;
  update public.tonight_sessions set status = 'cancelled', completed_at = now() where id = p_session;
end $$;

revoke all on function private.tonight_session(uuid) from public, anon, authenticated;
revoke execute on function
  public.start_tonight(jsonb), public.tonight_swipe(uuid, bigint, boolean), public.tonight_finish_swiping(uuid),
  public.tonight_submit_top(uuid, bigint[]), public.tonight_submit_ranking(uuid, bigint[]),
  public.tonight_advance(uuid, text, text, bigint[], bigint), public.cancel_tonight(uuid)
  from public, anon;
grant execute on function
  public.start_tonight(jsonb), public.tonight_swipe(uuid, bigint, boolean), public.tonight_finish_swiping(uuid),
  public.tonight_submit_top(uuid, bigint[]), public.tonight_submit_ranking(uuid, bigint[]),
  public.tonight_advance(uuid, text, text, bigint[], bigint), public.cancel_tonight(uuid)
  to authenticated;
