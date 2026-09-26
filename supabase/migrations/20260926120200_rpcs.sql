-- Actions the app calls with supabase.rpc(). Errors are raised with a short
-- code as the message (e.g. 'already_paired'); the app maps codes to strings.

-- --------------------------------------------------------------- pairing

-- Joins two unpaired users into a new couple. `p_me` is the caller, so
-- 'already_paired' is about them and 'partner_already_paired' about the other.
create function private.pair_users(p_me uuid, p_other uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c uuid;
begin
  -- Lock both rows in a fixed order so two simultaneous pairings can't interleave.
  perform 1 from public.profiles where id in (p_me, p_other) order by id for update;
  if (select couple_id from public.profiles where id = p_me) is not null then
    raise exception 'already_paired';
  end if;
  if (select couple_id from public.profiles where id = p_other) is not null then
    raise exception 'partner_already_paired';
  end if;

  insert into public.couples default values returning id into c;
  update public.profiles set couple_id = c where id in (p_me, p_other);

  -- Anything else pending for either of them is now obsolete.
  update public.pairing_invites set status = 'declined'
  where status = 'pending'
    and (from_user_id in (p_me, p_other)
         or to_email in (select email from public.profiles where id in (p_me, p_other)));
  delete from public.pairing_codes where owner_id in (p_me, p_other) and used_at is null;

  perform private.refresh_matches(c);
  return c;
end $$;

-- New 10-minute single-use code; replaces the caller's previous unused code.
create function public.create_pairing_code() returns json
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_uid();
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_expires timestamptz := now() + interval '10 minutes';
begin
  if (select couple_id from public.profiles where id = me) is not null then
    raise exception 'already_paired';
  end if;
  delete from public.pairing_codes where owner_id = me and used_at is null;
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      insert into public.pairing_codes (code, owner_id, expires_at) values (v_code, me, v_expires);
      exit;
    exception when unique_violation then
      -- collided with an old code; try another
    end;
  end loop;
  return json_build_object('code', v_code, 'expires_at', v_expires);
end $$;

create function public.redeem_pairing_code(p_code text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_uid();
  r public.pairing_codes;
  c uuid;
begin
  select * into r from public.pairing_codes
  where code = regexp_replace(upper(p_code), '[^A-Z0-9]', '', 'g')
  for update;
  if not found then raise exception 'code_not_found'; end if;
  if r.owner_id = me then raise exception 'own_code'; end if;
  if r.used_at is not null then raise exception 'code_used'; end if;
  if r.expires_at < now() then raise exception 'code_expired'; end if;

  update public.pairing_codes set used_at = now() where code = r.code;
  c := private.pair_users(me, r.owner_id);
  return json_build_object(
    'couple_id', c,
    'partner_name', (select display_name from public.profiles where id = r.owner_id));
end $$;

-- In-app invite by email; nothing is sent. Re-inviting the same email returns
-- the existing pending invite.
create function public.send_pairing_invite(p_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_uid();
  e text := lower(btrim(p_email));
  v_id uuid;
begin
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email'; end if;
  if e = (select email from public.profiles where id = me) then raise exception 'own_email'; end if;
  if (select couple_id from public.profiles where id = me) is not null then
    raise exception 'already_paired';
  end if;
  if exists (select 1 from public.profiles where email = e and couple_id is not null) then
    raise exception 'partner_already_paired';
  end if;

  select id into v_id from public.pairing_invites
  where from_user_id = me and to_email = e and status = 'pending';
  if v_id is null then
    insert into public.pairing_invites (from_user_id, to_email) values (me, e) returning id into v_id;
  end if;
  return v_id;
end $$;

-- Pending invites addressed to me, with the sender's name (which RLS on
-- profiles would otherwise hide).
create function public.my_pending_invites()
returns table (invite_id uuid, from_name text, sent_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.id, p.display_name, i.created_at
  from public.pairing_invites i
  join public.profiles p on p.id = i.from_user_id
  where i.status = 'pending'
    and i.to_email = (select email from public.profiles where id = auth.uid())
  order by i.created_at desc
$$;

create function public.respond_pairing_invite(p_invite_id uuid, p_accept boolean) returns json
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_uid();
  inv public.pairing_invites;
  c uuid;
begin
  select * into inv from public.pairing_invites where id = p_invite_id for update;
  if not found or inv.to_email is distinct from (select email from public.profiles where id = me) then
    raise exception 'invite_not_found';
  end if;
  if inv.status <> 'pending' then raise exception 'invite_not_pending'; end if;

  if not p_accept then
    update public.pairing_invites set status = 'declined' where id = inv.id;
    return json_build_object('accepted', false);
  end if;

  c := private.pair_users(me, inv.from_user_id);
  update public.pairing_invites set status = 'accepted' where id = inv.id;
  return json_build_object(
    'accepted', true,
    'couple_id', c,
    'partner_name', (select display_name from public.profiles where id = inv.from_user_id));
end $$;

-- Keeps swipe history, deletes the couple's matches, cancels an active Tonight.
create function public.unpair() returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_uid();
  c uuid;
begin
  select couple_id into c from public.profiles where id = me;
  if c is null then raise exception 'not_paired'; end if;
  perform 1 from public.profiles where couple_id = c order by id for update;

  update public.tonight_sessions set status = 'cancelled', completed_at = now()
  where couple_id = c and status in ('swiping', 'picking', 'ranking');
  delete from public.matches where couple_id = c;
  update public.profiles set couple_id = null where couple_id = c;
  update public.couples set dissolved_at = now() where id = c;
end $$;

-- -------------------------------------------------------------- discover

-- Saves a discover swipe. `matched` = this recipe is now a match for the couple.
-- Swiping the same recipe twice is ignored (the deck never shows it again).
create function public.discover_swipe(p_recipe_id bigint, p_liked boolean) returns json
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_uid();
  c uuid;
begin
  insert into public.swipes (user_id, recipe_id, context, liked)
  values (me, p_recipe_id, 'discover', p_liked)
  on conflict do nothing;

  select couple_id into c from public.profiles where id = me;
  return json_build_object('matched', p_liked and c is not null and exists (
    select 1 from public.matches m
    where m.couple_id = c and m.recipe_id = p_recipe_id and m.removed_at is null));
end $$;

-- Undoes the caller's most recent discover swipe. Undoing a like deletes the
-- match it was part of (a user-removed match stays, so it's never re-created).
create function public.undo_last_discover_swipe() returns json
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.require_uid();
  s public.swipes;
  c uuid;
begin
  select * into s from public.swipes
  where user_id = me and context = 'discover'
  order by created_at desc, id desc
  limit 1
  for update;
  if not found then raise exception 'nothing_to_undo'; end if;

  delete from public.swipes where id = s.id;
  if s.liked then
    select couple_id into c from public.profiles where id = me;
    delete from public.matches
    where couple_id = c and recipe_id = s.recipe_id and removed_at is null;
  end if;
  return json_build_object('recipe_id', s.recipe_id, 'liked', s.liked);
end $$;

-- --------------------------------------------------------------- matches

create function public.remove_match(p_recipe_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_uid();
  update public.matches set removed_at = now()
  where couple_id = private.my_couple_id() and recipe_id = p_recipe_id and removed_at is null;
  if not found then raise exception 'match_not_found'; end if;
end $$;

-- ------------------------------------------------------------------ grants
revoke execute on function
  public.create_pairing_code(), public.redeem_pairing_code(text),
  public.send_pairing_invite(text), public.my_pending_invites(),
  public.respond_pairing_invite(uuid, boolean), public.unpair(),
  public.discover_swipe(bigint, boolean), public.undo_last_discover_swipe(),
  public.remove_match(bigint)
  from public, anon;
grant execute on function
  public.create_pairing_code(), public.redeem_pairing_code(text),
  public.send_pairing_invite(text), public.my_pending_invites(),
  public.respond_pairing_invite(uuid, boolean), public.unpair(),
  public.discover_swipe(bigint, boolean), public.undo_last_discover_swipe(),
  public.remove_match(bigint)
  to authenticated;
-- pair_users and require_uid are called from the SECURITY DEFINER functions above.
revoke all on function private.pair_users(uuid, uuid) from public, anon, authenticated;
