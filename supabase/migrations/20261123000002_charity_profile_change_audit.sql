-- Givezy: changes to a public charity's profile made outside the website are recorded and reported (security review,
-- 23/11/2026).
--
-- A charity's owners, admins and fundraisers can change its public profile straight through the database API (the
-- column grants on public.charities and the charities_admin_update policy are unchanged). That skips the website's
-- profile page, which writes its own audit entry and emails Givezy's reviewer when an approved charity's name, logo,
-- cover or "what one gift pays for" figure changes. Only renames were recorded on that path until now
-- (charity.public_name_changed, 22/10/2026, unchanged).
--
-- 1. audit_charity_profile_change: after any update of an approved (or suspended) charity's name, logo, cover image,
--    description, website or impact figure by one of its own people (signed in; Givezy staff and the server are not
--    recorded here, as for renames), one 'charity.profile_changed' audit row: which fields changed, the old and new
--    name, and a fingerprint of each change (md5 of old and new, never the long text itself).
-- 2. The website's own saves (saveProfile, uploadImage) put the same fingerprints in their audit rows
--    (details.site_changes, src/lib/charity/profile-changes.ts). The daily job's email to Givezy lists the changes no
--    website save accounts for (src/lib/ops/daily.ts), so the reviewer hears about changes made outside the website,
--    and website saves are not reported twice (those already email the reviewer straight away when it matters).

create or replace function public.audit_charity_profile_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  fields text[] := '{}';
  prints jsonb := '{}';
  -- The fingerprint of one change: the same as changePrint() in src/lib/charity/profile-changes.ts.
  col text;
begin
  if old.status not in ('approved', 'suspended') or (select auth.uid()) is null or public.is_platform_admin() then
    return new;
  end if;
  if new.name_en is distinct from old.name_en then fields := fields || 'name_en'::text; end if;
  if new.logo_path is distinct from old.logo_path then fields := fields || 'logo_path'::text; end if;
  if new.cover_path is distinct from old.cover_path then fields := fields || 'cover_path'::text; end if;
  if new.description_en is distinct from old.description_en then fields := fields || 'description_en'::text; end if;
  if new.website is distinct from old.website then fields := fields || 'website'::text; end if;
  if new.impact_unit_cents is distinct from old.impact_unit_cents then fields := fields || 'impact_unit_cents'::text; end if;
  if new.impact_unit_one is distinct from old.impact_unit_one then fields := fields || 'impact_unit_one'::text; end if;
  if new.impact_unit_many is distinct from old.impact_unit_many then fields := fields || 'impact_unit_many'::text; end if;
  if cardinality(fields) = 0 then
    return new;
  end if;
  foreach col in array fields loop
    prints := prints || jsonb_build_object(col, md5(
      coalesce(to_jsonb(old) ->> col, '') || chr(31) || coalesce(to_jsonb(new) ->> col, '')));
  end loop;
  insert into public.audit_log (actor_user_id, action, entity_type, entity_id, details)
  values ((select auth.uid()), 'charity.profile_changed', 'charity', new.id::text,
          jsonb_build_object('fields', to_jsonb(fields), 'prints', prints, 'name', new.name_en)
          || case when 'name_en' = any (fields)
                  then jsonb_build_object('name_from', old.name_en, 'name_to', new.name_en) else '{}'::jsonb end);
  return new;
end $$;
revoke execute on function public.audit_charity_profile_change() from public, anon, authenticated;

drop trigger if exists charities_audit_profile_change on public.charities;
create trigger charities_audit_profile_change
  after update of name_en, logo_path, cover_path, description_en, website, impact_unit_cents, impact_unit_one, impact_unit_many
  on public.charities
  for each row execute function public.audit_charity_profile_change();
