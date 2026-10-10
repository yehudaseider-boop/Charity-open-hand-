-- Fixes from the code review (08/10/2026).

-- ---------------------------------------------------------------------------
-- 1. Admin rights need the second step (authenticator code) in the database
--    too, not only in the website. A session that only used the emailed link
--    (aal1) is treated as an ordinary signed-in person, even through the API.
-- ---------------------------------------------------------------------------
create or replace function public.has_second_step() returns boolean
language sql stable set search_path = '' as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
$$;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_second_step() and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'platform_admin'
  )
$$;

create or replace function public.is_charity_admin(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_second_step() and exists (
    select 1 from public.charity_admins ca
    where ca.charity_id = target and ca.user_id = (select auth.uid())
  )
$$;

grant execute on function public.has_second_step() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Charities only see donors who actually gave: not abandoned or failed
--    checkouts (POPIA: no reason to hold those people's details).
-- ---------------------------------------------------------------------------
create or replace view public.charity_donations with (security_barrier = true) as
  select
    d.id, d.charity_id, d.donor_id, d.status, d.amount_cents,
    d.paid_at, d.created_at, d.refunded_at, d.charged_back_at, d.tax_year,
    d.wants_18a, d.is_anonymous, d.message, d.campaign_id, d.recurring_id,
    c.donor_type, c.first_name, c.last_name, c.organisation_name, c.registration_number,
    c.contact_person, c.email, c.phone,
    c.address_line1, c.address_line2, c.suburb, c.city, c.postal_code,
    c.id_number_last4, c.tax_reference_last4
  from public.donations d
  left join public.donation_checkout_details c on c.donation_id = d.id
  where d.status in ('paid', 'refunded', 'charged_back')
    and (public.is_charity_admin(d.charity_id) or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 3. Legal details are locked while an application is being reviewed, so
--    what was vetted is what gets approved.
-- ---------------------------------------------------------------------------
create or replace function public.lock_charity_under_review() returns trigger
language plpgsql as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') or public.is_platform_admin() then
    return new;
  end if;
  if old.status = 'pending_review' and (
       new.legal_name_en is distinct from old.legal_name_en
       or new.legal_name_he is distinct from old.legal_name_he
       or new.npo_number is distinct from old.npo_number
       or new.pbo_number is distinct from old.pbo_number
       or new.s18a_reference is distinct from old.s18a_reference) then
    raise exception 'Legal details cannot change while the application is being reviewed';
  end if;
  return new;
end $$;
create trigger charities_lock_under_review before update on public.charities
  for each row execute function public.lock_charity_under_review();

-- ---------------------------------------------------------------------------
-- 4. Indexes: payment lookups by reference (webhook, return page) and the
--    charity dashboard's newest-first lists.
-- ---------------------------------------------------------------------------
create index if not exists donations_gateway_ref_idx on public.donations (gateway_ref);
create index if not exists donations_charity_created_idx on public.donations (charity_id, created_at desc);
