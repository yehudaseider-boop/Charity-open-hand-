-- An approved charity's public name changed by the charity itself is always recorded (22/10/2026 review).
--
-- The profile page tells the reviewer when an approved charity renames itself, but a charity admin can also
-- change the name straight through the database API, which skips that. This records every such change, from
-- whichever path, in the audit log, where the daily "needs a person" email and Admin, Payments list it. A change
-- by Givezy staff (or the server on their behalf) is not recorded here: they know.

create or replace function public.audit_charity_rename() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'approved' and new.name_en is distinct from old.name_en
     and (select auth.uid()) is not null and not public.is_platform_admin() then
    insert into public.audit_log (actor_user_id, action, entity_type, entity_id, details)
    values ((select auth.uid()), 'charity.public_name_changed', 'charity', new.id::text,
            jsonb_build_object('name_from', old.name_en, 'name_to', new.name_en));
  end if;
  return new;
end $$;
revoke execute on function public.audit_charity_rename() from public, anon, authenticated;

drop trigger if exists charities_audit_rename on public.charities;
create trigger charities_audit_rename after update of name_en on public.charities
  for each row execute function public.audit_charity_rename();
