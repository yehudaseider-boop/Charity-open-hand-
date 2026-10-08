-- Open Hand: charity dashboard
--
-- What a charity admin may see about their charity's giving, and nothing else.
--
--   * Charity admins no longer read the donations, donors or checkout details
--     tables directly. Those rows carry things that belong to the donor alone:
--     giving_kind (maaser, chomesh or general tzedaka), the encrypted ID and tax
--     numbers, the donor's account link and date of birth. Instead they read
--     the charity_donations view, which lists exactly the columns a charity
--     needs: the donation, its status and the donor details typed at checkout
--     (ID and tax numbers as last 4 digits only).
--   * The message and "anonymous" flag stay visible: the message was written to
--     the charity, and anonymous only hides the name on public pages (the
--     checkout tells the donor the charity still sees their details).
--   * A charity admin sees giving data only after the second login step (an
--     authenticator app). This is checked here, so a direct API call with a
--     one-step session gets nothing, whatever the website does.

-- ---------------------------------------------------------------------------
-- Second login step
-- ---------------------------------------------------------------------------
create or replace function public.has_second_factor() returns boolean
language sql stable set search_path = '' as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
$$;

-- A charity admin who has completed the second step, or a platform admin.
create or replace function public.can_view_charity_giving(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (public.is_charity_admin(target) and public.has_second_factor()) or public.is_platform_admin()
$$;
revoke execute on function public.can_view_charity_giving(uuid) from public, anon;
grant execute on function public.can_view_charity_giving(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Base tables: donors and platform admins only
-- ---------------------------------------------------------------------------
drop policy donations_read on public.donations;
create policy donations_read on public.donations for select to authenticated
  using (donor_id in (select public.my_donor_ids()) or public.is_platform_admin());

drop policy donors_own on public.donors;
create policy donors_own on public.donors for select to authenticated
  using (user_id = (select auth.uid()) or public.is_platform_admin());
-- donation_checkout_details follows donations (its policy checks the donation is visible).

-- Monthly donations and receipts hold nothing private to the donor, but they
-- are giving data, so the charity side needs the second step too.
drop policy recurring_read on public.recurring_donations;
create policy recurring_read on public.recurring_donations for select to authenticated
  using (donor_id in (select public.my_donor_ids()) or public.can_view_charity_giving(charity_id));

drop policy receipts_read on public.s18a_receipts;
create policy receipts_read on public.s18a_receipts for select to authenticated
  using (donor_id in (select public.my_donor_ids()) or public.can_view_charity_giving(charity_id));

-- ---------------------------------------------------------------------------
-- What a charity sees: one row per donation, with the details as given
-- ---------------------------------------------------------------------------
-- Owned by the database owner, so it reads past the base-table policies above;
-- the where clause is what limits it. security_barrier stops a caller's filter
-- from being evaluated before that check.
create view public.charity_donations with (security_barrier) as
select
  d.id,
  d.charity_id,
  d.donor_id,
  d.campaign_id,
  cp.title as campaign_title,
  d.recurring_id,
  d.amount_cents,
  d.platform_fee_cents,
  d.fee_vat_cents,
  d.processing_charge_cents,
  d.total_charged_cents,
  d.status,
  d.wants_18a,
  d.is_anonymous,
  d.message,
  d.campaign_answer,
  d.tax_year,
  d.paid_at,
  d.failed_at,
  d.refunded_at,
  d.charged_back_at,
  d.created_at,
  -- The date a charity goes by: when it was paid, or when it was started if not paid.
  coalesce(d.paid_at, d.created_at) as donation_date,
  cd.donor_type,
  cd.email,
  cd.first_name,
  cd.last_name,
  cd.organisation_name,
  cd.registration_number,
  cd.contact_person,
  cd.phone,
  cd.id_number_last4,
  cd.tax_reference_last4,
  cd.address_line1,
  cd.address_line2,
  cd.suburb,
  cd.city,
  cd.postal_code
from public.donations d
left join public.donation_checkout_details cd on cd.donation_id = d.id
left join public.campaigns cp on cp.id = d.campaign_id
where public.can_view_charity_giving(d.charity_id);

revoke all on public.charity_donations from public, anon, authenticated;
grant select on public.charity_donations to authenticated;

-- ---------------------------------------------------------------------------
-- Overview figures, worked out in the database so nothing is cut off by a
-- page size. Reads the view, so it shows only what the caller may see.
-- Months are calendar months in the given time zone (the app passes
-- Johannesburg from its config).
-- ---------------------------------------------------------------------------
create or replace function public.charity_giving_by_month(p_charity_id uuid, p_since timestamptz, p_time_zone text)
returns table (
  month date,
  paid_count bigint,
  paid_cents bigint,
  reversed_count bigint,
  reversed_cents bigint
)
language sql stable security invoker set search_path = '' as $$
  -- "Paid" counts donations still paid; refunded and charged-back donations
  -- are counted separately in the month they were paid.
  select
    (date_trunc('month', v.paid_at at time zone p_time_zone))::date as month,
    count(*) filter (where v.status = 'paid'),
    coalesce(sum(v.amount_cents) filter (where v.status = 'paid'), 0)::bigint,
    count(*) filter (where v.status in ('refunded', 'charged_back')),
    coalesce(sum(v.amount_cents) filter (where v.status in ('refunded', 'charged_back')), 0)::bigint
  from public.charity_donations v
  where v.charity_id = p_charity_id
    and v.paid_at is not null
    and v.paid_at >= p_since
  group by 1
  order by 1
$$;

create or replace function public.charity_giving_summary(p_charity_id uuid, p_tax_year int, p_month_start timestamptz)
returns table (
  tax_year_paid_count bigint,
  tax_year_paid_cents bigint,
  tax_year_donors bigint,
  tax_year_18a_count bigint,
  tax_year_reversed_count bigint,
  tax_year_reversed_cents bigint,
  month_paid_count bigint,
  month_paid_cents bigint,
  pending_count bigint,
  failed_this_month_count bigint
)
language sql stable security invoker set search_path = '' as $$
  select
    count(*) filter (where v.status = 'paid' and v.tax_year = p_tax_year),
    coalesce(sum(v.amount_cents) filter (where v.status = 'paid' and v.tax_year = p_tax_year), 0)::bigint,
    count(distinct v.donor_id) filter (where v.status = 'paid' and v.tax_year = p_tax_year),
    count(*) filter (where v.status = 'paid' and v.tax_year = p_tax_year and v.wants_18a),
    count(*) filter (where v.status in ('refunded', 'charged_back') and v.tax_year = p_tax_year),
    coalesce(sum(v.amount_cents) filter (where v.status in ('refunded', 'charged_back') and v.tax_year = p_tax_year), 0)::bigint,
    count(*) filter (where v.status = 'paid' and v.paid_at >= p_month_start),
    coalesce(sum(v.amount_cents) filter (where v.status = 'paid' and v.paid_at >= p_month_start), 0)::bigint,
    count(*) filter (where v.status = 'pending'),
    count(*) filter (where v.status = 'failed' and v.failed_at >= p_month_start)
  from public.charity_donations v
  where v.charity_id = p_charity_id
$$;

create or replace function public.charity_monthly_donations_summary(p_charity_id uuid)
returns table (status public.recurring_status, donations bigint, amount_cents bigint)
language sql stable security invoker set search_path = '' as $$
  select r.status, count(*), coalesce(sum(r.amount_cents), 0)::bigint
  from public.recurring_donations r
  where r.charity_id = p_charity_id and public.can_view_charity_giving(r.charity_id)
  group by r.status
$$;

revoke execute on function public.charity_giving_by_month(uuid, timestamptz, text) from public, anon;
revoke execute on function public.charity_giving_summary(uuid, int, timestamptz) from public, anon;
revoke execute on function public.charity_monthly_donations_summary(uuid) from public, anon;
grant execute on function public.charity_giving_by_month(uuid, timestamptz, text) to authenticated;
grant execute on function public.charity_giving_summary(uuid, int, timestamptz) to authenticated;
grant execute on function public.charity_monthly_donations_summary(uuid) to authenticated;
