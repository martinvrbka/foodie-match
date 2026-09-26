-- Set once the user has been through the first-run "What don't you eat?" step.
alter table public.profiles add column onboarded boolean not null default false;
grant update (onboarded) on public.profiles to authenticated;
