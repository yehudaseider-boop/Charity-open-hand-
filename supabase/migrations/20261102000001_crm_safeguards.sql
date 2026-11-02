-- CRM safeguards from the CRM check of 02/11/2026 (Yehuda: yes).
--
-- 1. A tag can only be put on a donor for the charity that owns the tag. The website already checks this;
--    the database now refuses it too, so a direct write can never cross two charities.
-- 2. When someone changes their email at sign-in, their profile follows. Adding a person to a charity's team
--    looks them up by profile email, and failed with "couldn't set up a sign-in" when the two differed.

-- 1 ---------------------------------------------------------------------------------------------------------
alter table public.charity_tags add constraint charity_tags_id_charity unique (id, charity_id);

-- Any row that already crosses two charities would block the new rule; there should be none, but remove it
-- rather than fail (the tag never belonged on that charity's donor).
delete from public.charity_donor_tags dt
using public.charity_tags t
where t.id = dt.tag_id and t.charity_id <> dt.charity_id;

alter table public.charity_donor_tags
  add constraint charity_donor_tags_same_charity
  foreign key (tag_id, charity_id) references public.charity_tags (id, charity_id) on delete cascade;

-- 2 ---------------------------------------------------------------------------------------------------------
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is not null and new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_profile_email() from public, anon, authenticated;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sync_profile_email();
