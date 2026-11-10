-- Givezy: team roles for a charity's dashboard (CRM build plan step 9, approved by Yehuda 10/11/2026).
--
-- One table, kept the same here and in src/lib/charity/permissions.ts:
--
--                                          Owner  Admin  Finance    Fundraiser  Viewer
--   See dashboard, donors, gifts             ✓      ✓      ✓           ✓          ✓ (no contact details)
--   Thank donors, journey, appeals, notes    ✓      ✓                  ✓
--   Edit profile, video, focus card          ✓      ✓                  ✓
--   Approve or decline s18A receipts         ✓      ✓      ✓
--   Downloads (donors, gifts, IT3(d))        ✓      ✓      ✓
--   Bank details, payouts                    ✓             view only
--   Team members and roles                   ✓
--
-- Most of a charity's data is read and written by the website's server after it checks the role (service role).
-- This migration makes the database hold the same line wherever a signed-in person reaches it directly:
--   1. three new roles; existing admins stay 'admin', the owner stays 'owner';
--   2. public.charity_role() and public.charity_can(charity, permission), with the same second-step and
--      no-password rules as is_charity_admin;
--   3. a viewer gets no email address, phone number or postal address from the charity view or any charity
--      function (an erased donor's placeholder address still comes back, so pages can say "details erased"),
--      and no imported contacts;
--   4. writes a signed-in member may make directly need the matching permission: the page, photos, updates,
--      campaigns and categories ('profile'), the application and its documents ('application'), and the
--      charity's contact settings ('profile' or 'application'); bank changes stay the owner's (guard_charity_bank_fields);
--   5. the bank columns are closed to every browser: the server reads them for the owner and finance.

-- 1 ---------------------------------------------------------------------------------------------------------
-- New enum values can't be used in the transaction that adds them, so everything below compares role::text.
alter type public.charity_admin_role add value if not exists 'finance';
alter type public.charity_admin_role add value if not exists 'fundraiser';
alter type public.charity_admin_role add value if not exists 'viewer';

comment on column public.charity_admins.role is
  'owner (one per charity), admin, finance, fundraiser or viewer. What each may do: public.charity_can() and src/lib/charity/permissions.ts.';

-- 2 ---------------------------------------------------------------------------------------------------------
-- The signed-in person's role at this charity: 'owner' for a Givezy platform admin; null for anyone else, before
-- the second step, or in a session started with a password.
create function public.charity_role(target uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when public.is_platform_admin() then 'owner'
    when not (public.has_second_step() and public.signed_in_without_password()) then null
    else (select ca.role::text from public.charity_admins ca where ca.charity_id = target and ca.user_id = (select auth.uid()))
  end
$$;
revoke all on function public.charity_role(uuid) from public, anon;
grant execute on function public.charity_role(uuid) to authenticated, service_role;

create function public.charity_can(target uuid, perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(case perm
    when 'view'        then r in ('owner', 'admin', 'finance', 'fundraiser', 'viewer')
    when 'contact'     then r in ('owner', 'admin', 'finance', 'fundraiser')
    when 'message'     then r in ('owner', 'admin', 'fundraiser')
    when 'profile'     then r in ('owner', 'admin', 'fundraiser')
    when 'receipts'    then r in ('owner', 'admin', 'finance')
    when 'export'      then r in ('owner', 'admin', 'finance')
    when 'gifts'       then r in ('owner', 'admin', 'finance')
    when 'application' then r in ('owner', 'admin')
    when 'bank_view'   then r in ('owner', 'finance')
    when 'bank_edit'   then r = 'owner'
    when 'owner'       then r = 'owner'
    else false
  end, false)
  from (select public.charity_role(target) as r) x
$$;
revoke all on function public.charity_can(uuid, text) from public, anon;
grant execute on function public.charity_can(uuid, text) to authenticated, service_role;

-- 3 ---------------------------------------------------------------------------------------------------------
-- Contact details, or an erased donor's placeholder address (which identifies nobody).
create function public.charity_contact_or_null(target uuid, value text) returns text
language sql stable security definer set search_path = '' as $$
  select case when value is null then null
              when public.charity_can(target, 'contact') or value ilike '%@erased.invalid' then value
              else null end
$$;
revoke all on function public.charity_contact_or_null(uuid, text) from public, anon;
grant execute on function public.charity_contact_or_null(uuid, text) to authenticated, service_role;

create or replace view public.charity_donations with (security_barrier = true) as
  select
    d.id, d.charity_id, d.donor_id, d.status, d.amount_cents,
    d.paid_at, d.created_at, d.refunded_at, d.charged_back_at, d.tax_year,
    d.wants_18a, d.is_anonymous, d.message, d.campaign_id, d.recurring_id,
    c.donor_type, c.first_name, c.last_name, c.organisation_name, c.registration_number,
    case when k.contact then c.contact_person end as contact_person,
    (case when k.contact or c.email::text ilike '%@erased.invalid' then c.email end)::public.citext as email,
    case when k.contact then c.phone end as phone,
    case when k.contact then c.address_line1 end as address_line1,
    case when k.contact then c.address_line2 end as address_line2,
    case when k.contact then c.suburb end as suburb,
    case when k.contact then c.city end as city,
    case when k.contact then c.postal_code end as postal_code,
    d.dedication_kind, d.dedication_name,
    d.recorded_method, d.external_ref, d.came_from, d.import_id
  from public.donations d
  left join public.donation_checkout_details c on c.donation_id = d.id
  -- Worked out once per row, not once per column.
  cross join lateral (select public.charity_can(d.charity_id, 'contact') as contact) k
  where d.status in ('paid', 'refunded', 'charged_back')
    and (public.is_charity_admin(d.charity_id) or public.is_platform_admin());

-- The charity functions that return contact details keep their rules and results; a wrapper with the same name
-- and shape blanks the contact columns for a role without 'contact'. The originals are renamed and closed to
-- every browser (only the wrappers, which run as their owner, call them).
alter function public.charity_donor_list(uuid) rename to charity_donor_list_full;
revoke all on function public.charity_donor_list_full(uuid) from public, anon, authenticated;
create function public.charity_donor_list(p_charity_id uuid)
returns table (
  donor_id uuid, donor_type public.donor_type, display_name text, email text, phone text,
  donation_count bigint, total_cents bigint, first_paid_at timestamptz, last_paid_at timestamptz,
  wants_18a boolean, is_anonymous boolean
)
language sql stable security definer set search_path = '' as $$
  select f.donor_id, f.donor_type, f.display_name,
         public.charity_contact_or_null(p_charity_id, f.email),
         case when public.charity_can(p_charity_id, 'contact') then f.phone end,
         f.donation_count, f.total_cents, f.first_paid_at, f.last_paid_at, f.wants_18a, f.is_anonymous
  from public.charity_donor_list_full(p_charity_id) f
$$;
revoke execute on function public.charity_donor_list(uuid) from public, anon;
grant execute on function public.charity_donor_list(uuid) to authenticated;

alter function public.charity_monthly_list(uuid) rename to charity_monthly_list_full;
revoke all on function public.charity_monthly_list_full(uuid) from public, anon, authenticated;
create function public.charity_monthly_list(p_charity_id uuid)
returns table (
  recurring_id uuid, status text, retrying boolean, amount_cents bigint, charge_day int,
  next_charge_at timestamptz, started_at timestamptz, last_paid_at timestamptz,
  paid_count bigint, paid_cents bigint, wants_18a boolean, is_anonymous boolean,
  dedication_kind text, dedication_name text,
  donor_type text, display_name text, email text, phone text,
  paused_at timestamptz, ended_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select f.recurring_id, f.status, f.retrying, f.amount_cents, f.charge_day, f.next_charge_at, f.started_at, f.last_paid_at,
         f.paid_count, f.paid_cents, f.wants_18a, f.is_anonymous, f.dedication_kind, f.dedication_name,
         f.donor_type, f.display_name,
         public.charity_contact_or_null(p_charity_id, f.email),
         case when public.charity_can(p_charity_id, 'contact') then f.phone end,
         f.paused_at, f.ended_at
  from public.charity_monthly_list_full(p_charity_id) f
$$;
revoke execute on function public.charity_monthly_list(uuid) from public, anon;
grant execute on function public.charity_monthly_list(uuid) to authenticated;

alter function public.charity_lapsed_monthly(uuid, timestamptz, timestamptz) rename to charity_lapsed_monthly_full;
revoke all on function public.charity_lapsed_monthly_full(uuid, timestamptz, timestamptz) from public, anon, authenticated;
create function public.charity_lapsed_monthly(p_charity_id uuid, p_from timestamptz, p_to timestamptz)
returns table (
  recurring_id uuid, donor_id uuid, amount_cents bigint, ended_at timestamptz, last_paid_at timestamptz,
  reason text, donor_type text, display_name text, email text, phone text
)
language sql stable security definer set search_path = '' as $$
  select f.recurring_id, f.donor_id, f.amount_cents, f.ended_at, f.last_paid_at, f.reason, f.donor_type, f.display_name,
         public.charity_contact_or_null(p_charity_id, f.email),
         case when public.charity_can(p_charity_id, 'contact') then f.phone end
  from public.charity_lapsed_monthly_full(p_charity_id, p_from, p_to) f
$$;
revoke execute on function public.charity_lapsed_monthly(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.charity_lapsed_monthly(uuid, timestamptz, timestamptz) to authenticated;

-- charity_keeping_summary reads charity_keeping_donors by name, so after this it reads the wrapper: its counts
-- don't use contact details, so they are the same for every role.
alter function public.charity_keeping_donors(uuid, timestamptz, timestamptz, timestamptz, timestamptz) rename to charity_keeping_donors_full;
revoke all on function public.charity_keeping_donors_full(uuid, timestamptz, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
create function public.charity_keeping_donors(p_charity_id uuid, p_last_from timestamptz, p_this_from timestamptz, p_this_to timestamptz, p_now timestamptz)
returns table (
  donor_id uuid, this_cents bigint, last_cents bigint, earlier_cents bigint, after_cents bigint, last_paid_at timestamptz,
  recorded_only boolean, erased boolean, donor_type text, display_name text, email text, phone text
)
language sql stable security definer set search_path = '' as $$
  select f.donor_id, f.this_cents, f.last_cents, f.earlier_cents, f.after_cents, f.last_paid_at, f.recorded_only, f.erased,
         f.donor_type, f.display_name,
         public.charity_contact_or_null(p_charity_id, f.email),
         case when public.charity_can(p_charity_id, 'contact') then f.phone end
  from public.charity_keeping_donors_full(p_charity_id, p_last_from, p_this_from, p_this_to, p_now) f
$$;
revoke execute on function public.charity_keeping_donors(uuid, timestamptz, timestamptz, timestamptz, timestamptz) from public, anon;
grant execute on function public.charity_keeping_donors(uuid, timestamptz, timestamptz, timestamptz, timestamptz) to authenticated;

-- Imported donor contacts are contact details: not for a viewer.
drop policy charity_admins_read on public.charity_contacts;
create policy charity_admins_read on public.charity_contacts for select to authenticated
  using (public.charity_can(charity_id, 'contact'));

-- 4 ---------------------------------------------------------------------------------------------------------
drop policy charities_admin_update on public.charities;
create policy charities_admin_update on public.charities for update to authenticated
  using (public.charity_can(id, 'profile') or public.charity_can(id, 'application'))
  with check (public.charity_can(id, 'profile') or public.charity_can(id, 'application'));

drop policy charity_private_rw on public.charity_private;
create policy charity_private_read on public.charity_private for select to authenticated
  using (public.is_charity_admin(charity_id) or public.is_platform_admin());
create policy charity_private_update on public.charity_private for update to authenticated
  using (public.charity_can(charity_id, 'profile') or public.charity_can(charity_id, 'application'))
  with check (public.charity_can(charity_id, 'profile') or public.charity_can(charity_id, 'application'));

drop policy charity_categories_write on public.charity_categories;
create policy charity_categories_write on public.charity_categories for all to authenticated
  using (public.charity_can(charity_id, 'profile') or public.charity_can(charity_id, 'application'))
  with check (public.charity_can(charity_id, 'profile') or public.charity_can(charity_id, 'application'));

drop policy campaigns_admin_rw on public.campaigns;
create policy campaigns_admin_read on public.campaigns for select to authenticated
  using (public.is_charity_admin(charity_id) or public.is_platform_admin());
create policy campaigns_admin_write on public.campaigns for all to authenticated
  using (public.charity_can(charity_id, 'profile'))
  with check (public.charity_can(charity_id, 'profile'));

drop policy charity_documents_rw on public.charity_documents;
-- The bank confirmation letter shows the bank account: for the owner and finance (and Givezy) only.
create policy charity_documents_read on public.charity_documents for select to authenticated
  using ((public.is_charity_admin(charity_id) or public.is_platform_admin())
         and (document_type <> 'bank_confirmation' or public.charity_can(charity_id, 'bank_view')));
create policy charity_documents_write on public.charity_documents for all to authenticated
  using (public.charity_can(charity_id, 'application'))
  with check (public.charity_can(charity_id, 'application'));

drop policy charity_photos_add on public.charity_photos;
create policy charity_photos_add on public.charity_photos for insert to authenticated
  with check (public.charity_can(charity_id, 'profile'));
drop policy charity_photos_remove on public.charity_photos;
create policy charity_photos_remove on public.charity_photos for delete to authenticated
  using (public.charity_can(charity_id, 'profile'));

drop policy charity_updates_add on public.charity_updates;
create policy charity_updates_add on public.charity_updates for insert to authenticated
  with check (public.charity_can(charity_id, 'profile') and posted_by = (select auth.uid()));
drop policy charity_updates_remove on public.charity_updates;
create policy charity_updates_remove on public.charity_updates for delete to authenticated
  using (public.charity_can(charity_id, 'profile'));

-- The same paths as 20261109000001_review_fixes_09_11.sql (section 5), with the role check.
drop policy if exists charity_public_write on storage.objects;
create policy charity_public_write on storage.objects for all to authenticated
  using (bucket_id = 'charity-public'
         and name !~ '\.\.' and name !~ '^/' and strpos(name, chr(92)) = 0
         and (name ~ '^[^/]+/(logo|cover)[^/]*$' or name ~ '^[^/]+/(photos|updates)/[^/]+$')
         and public.charity_can(((storage.foldername(name))[1])::uuid, 'profile'))
  with check (bucket_id = 'charity-public'
         and name !~ '\.\.' and name !~ '^/' and strpos(name, chr(92)) = 0
         and (name ~ '^[^/]+/(logo|cover)[^/]*$' or name ~ '^[^/]+/(photos|updates)/[^/]+$')
         and public.charity_can(((storage.foldername(name))[1])::uuid, 'profile'));

-- The files themselves: the website names them <charity id>/<document type>-<uuid>.<ext>
-- (src/app/charity-admin/[id]/application/actions.ts), so a bank confirmation letter is found by its name.
drop policy if exists charity_documents_read on storage.objects;
create policy charity_documents_read on storage.objects for select to authenticated
  using (bucket_id = 'charity-documents'
         and name !~ '\.\.' and name !~ '^/' and strpos(name, chr(92)) = 0
         and (public.is_platform_admin()
              or (public.is_charity_admin(((storage.foldername(name))[1])::uuid)
                  and (name !~ '^[^/]+/bank_confirmation-'
                       or public.charity_can(((storage.foldername(name))[1])::uuid, 'bank_view')))));

drop policy if exists charity_documents_insert on storage.objects;
create policy charity_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'charity-documents'
         and name !~ '\.\.' and name !~ '^/' and strpos(name, chr(92)) = 0
         and (public.is_platform_admin()
              or (public.charity_can(((storage.foldername(name))[1])::uuid, 'application')
                  and public.charity_application_open(((storage.foldername(name))[1])::uuid))));

-- The charity's contact person, email and phone are what Givezy uses to check a second-step reset or a bank change:
-- the owner's alone to change (the website saves them only for the owner), whatever the row policy allows.
create function public.guard_charity_contact_fields() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') or public.is_platform_admin() then
    return new;
  end if;
  if (new.contact_name is distinct from old.contact_name
      or new.contact_email is distinct from old.contact_email
      or new.contact_phone is distinct from old.contact_phone)
     and not public.charity_can(new.charity_id, 'owner') then
    raise exception 'A charity''s contact details can only be changed by its owner';
  end if;
  return new;
end $$;
revoke all on function public.guard_charity_contact_fields() from public, anon, authenticated;
create trigger charity_private_contact_guard before update on public.charity_private
  for each row execute function public.guard_charity_contact_fields();

-- The application's details (legal name, registration numbers, address) are the application roles' (owner and
-- admin), even though the page roles may update the charity row for the profile.
create function public.guard_charity_application_fields() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') or public.is_platform_admin() then
    return new;
  end if;
  if (new.legal_name_en is distinct from old.legal_name_en
      or new.legal_name_he is distinct from old.legal_name_he
      or new.npo_number is distinct from old.npo_number
      or new.pbo_number is distinct from old.pbo_number
      or new.s18a_reference is distinct from old.s18a_reference
      or new.address_line1 is distinct from old.address_line1
      or new.address_line2 is distinct from old.address_line2
      or new.suburb is distinct from old.suburb
      or new.city is distinct from old.city
      or new.postal_code is distinct from old.postal_code)
     and not public.charity_can(new.id, 'application') then
    raise exception 'A charity''s application details can only be changed by its owner or an admin';
  end if;
  return new;
end $$;
revoke all on function public.guard_charity_application_fields() from public, anon, authenticated;
create trigger charities_application_guard before update on public.charities
  for each row execute function public.guard_charity_application_fields();

-- 5 ---------------------------------------------------------------------------------------------------------
-- Every column of charity_private except the ciphertext was readable by any member (20261106000001). The bank
-- columns now aren't readable by any browser: the server reads them for the owner and finance.
revoke select on public.charity_private from authenticated;
grant select (
  charity_id, contact_name, contact_email, contact_phone, updated_at, notify_donations,
  tax_reference_number, legal_form, registration_number, sars_details_updated_at
) on public.charity_private to authenticated;
