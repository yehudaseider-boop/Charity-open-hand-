-- Open Hand: what a charity can see about its donations (the charity dashboard).
--
-- Until now a charity admin could read the WHOLE donation row through the API:
-- our platform fee and processing charge, the gateway reference, and the
-- donor's private choice of maaser, chomesh or general tzedaka. They could also
-- read whole donor rows. A charity should see what it needs to run its books
-- and issue receipts, and nothing more. So:
--
--   * the donor's private giving kind moves to its own donor-only table;
--   * charity admins can no longer read the donations, donors or checkout
--     details tables directly (donors and platform admins still can);
--   * charities read through purpose-built views and functions that leave out
--     fees, gateway data and the giving kind, and that only ever return rows
--     for charities the signed-in person manages.

-- ---------------------------------------------------------------------------
-- 1. The donor's private giving kind
-- ---------------------------------------------------------------------------
create table public.donation_giving_kinds (
  donation_id uuid primary key references public.donations (id) on delete cascade,
  kind text not null check (kind in ('maaser', 'chomesh', 'tzedaka'))
);
insert into public.donation_giving_kinds (donation_id, kind)
  select id, giving_kind from public.donations where giving_kind is not null;
alter table public.donations drop column giving_kind;

alter table public.donation_giving_kinds enable row level security;
revoke all on public.donation_giving_kinds from anon;
revoke insert, update, delete on public.donation_giving_kinds from authenticated;
create policy giving_kinds_donor_read on public.donation_giving_kinds for select to authenticated
  using (exists (
    select 1 from public.donations d
    where d.id = donation_id and d.donor_id in (select public.my_donor_ids())
  ));

-- ---------------------------------------------------------------------------
-- 2. Charity admins no longer read the base tables directly
-- ---------------------------------------------------------------------------
drop policy donations_read on public.donations;
create policy donations_read on public.donations for select to authenticated
  using (donor_id in (select public.my_donor_ids()) or public.is_platform_admin());

drop policy donors_own on public.donors;
create policy donors_own on public.donors for select to authenticated
  using (user_id = (select auth.uid()) or public.is_platform_admin());

-- (donation_checkout_details is readable only for donations the person can read,
--  so it follows the donations policy above.)

-- ---------------------------------------------------------------------------
-- 3. What a charity sees
-- ---------------------------------------------------------------------------
-- One row per donation to a charity the person manages (or any, for a platform
-- admin), with the donor details as typed at checkout. No fees, no gateway
-- data, no giving kind, no full ID or tax numbers (last 4 only).
create view public.charity_donations with (security_barrier = true) as
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
  where public.is_charity_admin(d.charity_id) or public.is_platform_admin();

revoke all on public.charity_donations from anon, authenticated;
grant select on public.charity_donations to authenticated;

-- Totals for a period (by the day the donation was paid, or started if it never
-- was). Paid donations only count towards money; refunded and charged back are
-- counted separately.
create or replace function public.charity_overview(p_charity_id uuid, p_from timestamptz, p_to timestamptz)
returns table (
  paid_count bigint, paid_cents bigint, donor_count bigint,
  receipt_requested_cents bigint,
  refunded_count bigint, refunded_cents bigint, charged_back_count bigint,
  pending_count bigint, failed_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_charity_admin(p_charity_id) or public.is_platform_admin()) then
    raise exception 'Not allowed';
  end if;
  return query
    select
      count(*) filter (where d.status = 'paid'),
      coalesce(sum(d.amount_cents) filter (where d.status = 'paid'), 0)::bigint,
      count(distinct d.donor_id) filter (where d.status = 'paid'),
      coalesce(sum(d.amount_cents) filter (where d.status = 'paid' and d.wants_18a), 0)::bigint,
      count(*) filter (where d.status = 'refunded'),
      coalesce(sum(d.amount_cents) filter (where d.status = 'refunded'), 0)::bigint,
      count(*) filter (where d.status = 'charged_back'),
      count(*) filter (where d.status = 'pending'),
      count(*) filter (where d.status = 'failed')
    from public.donations d
    where d.charity_id = p_charity_id
      and coalesce(d.paid_at, d.created_at) >= p_from and coalesce(d.paid_at, d.created_at) < p_to;
end $$;

-- Paid donations by calendar month in Johannesburg time, newest first.
create or replace function public.charity_monthly_totals(p_charity_id uuid, p_months int default 24)
returns table (month date, donation_count bigint, amount_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_charity_admin(p_charity_id) or public.is_platform_admin()) then
    raise exception 'Not allowed';
  end if;
  return query
    select (date_trunc('month', d.paid_at at time zone 'Africa/Johannesburg'))::date as month,
           count(*), coalesce(sum(d.amount_cents), 0)::bigint
    from public.donations d
    where d.charity_id = p_charity_id and d.status = 'paid' and d.paid_at is not null
    group by 1
    order by 1 desc
    limit greatest(1, least(coalesce(p_months, 24), 120));
end $$;

-- One row per donor who has given (paid) to the charity, using the details they
-- typed with their most recent donation.
create or replace function public.charity_donor_list(p_charity_id uuid)
returns table (
  donor_id uuid, donor_type public.donor_type, display_name text, email text, phone text,
  donation_count bigint, total_cents bigint, first_paid_at timestamptz, last_paid_at timestamptz,
  wants_18a boolean, is_anonymous boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_charity_admin(p_charity_id) or public.is_platform_admin()) then
    raise exception 'Not allowed';
  end if;
  return query
    with paid as (
      select d.*, c.donor_type as dt, c.first_name, c.last_name, c.organisation_name, c.email as em, c.phone as ph
      from public.donations d
      join public.donation_checkout_details c on c.donation_id = d.id
      where d.charity_id = p_charity_id and d.status = 'paid'
    ), latest as (
      select distinct on (p.donor_id) p.donor_id as did, p.dt, p.first_name, p.last_name, p.organisation_name, p.em, p.ph
      from paid p order by p.donor_id, p.paid_at desc
    ), totals as (
      select p.donor_id as did, count(*) as n, sum(p.amount_cents)::bigint as total,
             min(p.paid_at) as first_at, max(p.paid_at) as last_at,
             bool_or(p.wants_18a) as w18, bool_or(p.is_anonymous) as anon
      from paid p group by p.donor_id
    )
    select l.did, l.dt,
           case when l.dt = 'individual' then trim(coalesce(l.first_name, '') || ' ' || coalesce(l.last_name, ''))
                else coalesce(l.organisation_name, '') end,
           l.em::text, l.ph, t.n, t.total, t.first_at, t.last_at, t.w18, t.anon
    from latest l join totals t on t.did = l.did
    order by t.total desc, t.last_at desc;
end $$;

revoke execute on function public.charity_overview(uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.charity_monthly_totals(uuid, int) from public, anon;
revoke execute on function public.charity_donor_list(uuid) from public, anon;
grant execute on function public.charity_overview(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.charity_monthly_totals(uuid, int) to authenticated;
grant execute on function public.charity_donor_list(uuid) to authenticated;
