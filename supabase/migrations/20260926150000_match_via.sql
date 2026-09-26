-- How a match was created: 'swipe' (live, both phones celebrate) or
-- 'retroactive' (after pairing or removing an exclusion; no big animation).
alter table public.matches
  add column via text not null default 'retroactive' check (via in ('swipe', 'retroactive'));

create or replace function private.on_discover_like() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c uuid;
  partner uuid;
begin
  select couple_id into c from public.profiles where id = new.user_id;
  partner := private.partner_id(new.user_id);
  if c is not null and partner is not null and private.is_match(new.user_id, partner, new.recipe_id) then
    insert into public.matches (couple_id, recipe_id, via) values (c, new.recipe_id, 'swipe')
    on conflict do nothing;
  end if;
  return null;
end $$;
