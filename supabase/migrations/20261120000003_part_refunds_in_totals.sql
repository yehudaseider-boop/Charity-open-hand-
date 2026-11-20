-- Givezy: part refunds in the charity's totals (code review, 20/11/2026).
--
-- 20261120000001 added donations.refunded_cents: a part refund leaves the gift 'paid' and grows refunded_cents. The
-- s18A receipt and the donor's tax pack count what is left, but every other money view still counted the whole gift
-- (a R1 000 gift refunded R400 showed as R1 000 received on the dashboard while its receipt said R600).
--
-- The rule, everywhere below: a paid gift counts what is left (amount_cents - refunded_cents). A paid gift with
-- nothing left (refunded in full in parts, which stays 'paid' when the donor also paid a contribution or the card
-- charge) counts as a refund, not a gift: it is left out of gift counts, donor counts and "did they give". Part
-- refunds are added to the refunded figures. The contribution and the card charge were never in these totals and
-- still aren't.
--
-- 1. charity_donations gains refunded_cents, as its last column (a view can only grow at the end). Everything else
--    is as in 20261119000001_dashboard_views_fast.sql; its grants and security_barrier stay.
-- 2. charity_overview, charity_monthly_totals, charity_insights, campaign_progress (the public "raised" figure) and
--    the four list functions behind the wrappers (charity_donor_list_full, charity_monthly_list_full,
--    charity_keeping_donors_full, charity_lapsed_monthly_full) count what is left. Same names, arguments, columns,
--    security definer, search_path and permission checks as their latest definitions; create or replace keeps their
--    grants. The wrappers (20261119000002) and charity_keeping_summary read these, so they follow.
-- A database test checks the totals for a part refund and for a gift refunded in full in parts
-- (part-refunds-totals-db.test.ts).

-- 1 -----------------------------------------------------------------------------------------------------------
create or replace view public.charity_donations with (security_barrier = true) as
  select
    d.id, d.charity_id, d.donor_id, d.status, d.amount_cents,
    d.paid_at, d.created_at, d.refunded_at, d.charged_back_at, d.tax_year,
    d.wants_18a, d.is_anonymous, d.message, d.campaign_id, d.recurring_id,
    c.donor_type, c.first_name, c.last_name, c.organisation_name, c.registration_number,
    case when m.contact then c.contact_person end as contact_person,
    (case when m.contact or c.email::text ilike '%@erased.invalid' then c.email end)::public.citext as email,
    case when m.contact then c.phone end as phone,
    case when m.contact then c.address_line1 end as address_line1,
    case when m.contact then c.address_line2 end as address_line2,
    case when m.contact then c.suburb end as suburb,
    case when m.contact then c.city end as city,
    case when m.contact then c.postal_code end as postal_code,
    d.dedication_kind, d.dedication_name,
    d.recorded_method, d.external_ref, d.came_from, d.import_id,
    -- Cents of the gift refunded in part refunds (the gift stays 'paid'): what is left is amount_cents - refunded_cents.
    d.refunded_cents
  from public.donations d
  join (
    select v.charity_id, public.charity_can(v.charity_id, 'contact') as contact
    from (
      select ca.charity_id from public.charity_admins ca
      where ca.user_id = (select auth.uid()) and (select public.has_second_step())
      union
      select ch.id from public.charities ch where (select public.is_platform_admin())
    ) v
    -- Keeps this subquery whole: without it the planner folds it into the outer query and copies charity_can into
    -- each of the eight contact columns, once per gift (code review 19/11/2026: Donations took 38 s at 20 000 gifts).
    offset 0
  ) m on m.charity_id = d.charity_id
  left join public.donation_checkout_details c on c.donation_id = d.id
  where d.status in ('paid', 'refunded', 'charged_back');

-- 2 -----------------------------------------------------------------------------------------------------------
-- Totals for a period (by the day the donation was paid, or started if it never was). Paid donations count what is
-- left of them; refunds (whole, and part refunds of paid gifts) and chargebacks are counted separately.
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
      count(*) filter (where d.status = 'paid' and d.amount_cents > d.refunded_cents),
      coalesce(sum(d.amount_cents - d.refunded_cents) filter (where d.status = 'paid'), 0)::bigint,
      count(distinct d.donor_id) filter (where d.status = 'paid' and d.amount_cents > d.refunded_cents),
      coalesce(sum(d.amount_cents - d.refunded_cents) filter (where d.status = 'paid' and d.wants_18a), 0)::bigint,
      -- A paid gift refunded in full in parts is a refund, like a refunded one.
      count(*) filter (where d.status = 'refunded' or (d.status = 'paid' and d.refunded_cents > 0 and d.refunded_cents = d.amount_cents)),
      coalesce(sum(d.amount_cents) filter (where d.status = 'refunded'), 0)::bigint
        + coalesce(sum(d.refunded_cents) filter (where d.status = 'paid'), 0)::bigint,
      count(*) filter (where d.status = 'charged_back'),
      count(*) filter (where d.status = 'pending'),
      count(*) filter (where d.status = 'failed')
    from public.donations d
    where d.charity_id = p_charity_id
      and coalesce(d.paid_at, d.created_at) >= p_from and coalesce(d.paid_at, d.created_at) < p_to;
end $$;

-- Paid donations by calendar month in Johannesburg time, newest first, counting what is left of each; a gift with
-- nothing left is not counted. The contribution to Givezy is never included.
create or replace function public.charity_monthly_totals(p_charity_id uuid, p_months int default 24)
returns table (month date, donation_count bigint, amount_cents bigint, monthly_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_charity_admin(p_charity_id) or public.is_platform_admin()) then
    raise exception 'Not allowed';
  end if;
  return query
    select (date_trunc('month', d.paid_at at time zone 'Africa/Johannesburg'))::date as month,
           count(*),
           coalesce(sum(d.amount_cents - d.refunded_cents), 0)::bigint,
           coalesce(sum(d.amount_cents - d.refunded_cents) filter (where d.recurring_id is not null), 0)::bigint
    from public.donations d
    where d.charity_id = p_charity_id and d.status = 'paid' and d.paid_at is not null
      and d.amount_cents > d.refunded_cents
    group by 1
    order by 1 desc
    limit greatest(1, least(coalesce(p_months, 24), 120));
end $$;

-- New, returning and repeat donors: a gift with nothing left is not giving.
create or replace function public.charity_insights(p_charity_id uuid, p_from timestamptz, p_to timestamptz)
returns table (new_donors bigint, returning_donors bigint, repeat_donors bigint, all_donors bigint, monthly_active bigint, monthly_active_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_charity_admin(p_charity_id) or public.is_platform_admin()) then
    raise exception 'Not allowed';
  end if;
  return query
    with paid as (
      select d.donor_id, d.paid_at from public.donations d
       where d.charity_id = p_charity_id and d.status = 'paid' and d.paid_at is not null
         and d.amount_cents > d.refunded_cents
    ),
    per_donor as (
      select donor_id, min(paid_at) as first_paid, count(*) as gifts,
             bool_or(paid_at >= p_from and paid_at < p_to) as gave_in_period
        from paid group by donor_id
    )
    select
      count(*) filter (where first_paid >= p_from and first_paid < p_to),
      count(*) filter (where gave_in_period and first_paid < p_from),
      count(*) filter (where gifts >= 2),
      count(*),
      (select count(*) from public.recurring_donations r where r.charity_id = p_charity_id and r.status = 'active'),
      (select coalesce(sum(r.amount_cents), 0)::bigint from public.recurring_donations r where r.charity_id = p_charity_id and r.status = 'active')
    from per_donor;
end $$;

-- A campaign's raised total and gift count, for the website and the app: what is left of each paid gift.
create or replace function public.campaign_progress(p_campaign_ids uuid[])
returns table (campaign_id uuid, raised_cents bigint, gift_count bigint)
language sql stable security definer set search_path = '' as $$
  select c.id,
         coalesce(sum(d.amount_cents - d.refunded_cents) filter (where d.status = 'paid'), 0)::bigint,
         count(d.id) filter (where d.status = 'paid' and d.amount_cents > d.refunded_cents)
    from public.campaigns c
    join public.charities ch on ch.id = c.charity_id
    left join public.donations d on d.campaign_id = c.id
   where c.id = any (p_campaign_ids)
     and ((c.status <> 'draft' and ch.status = 'approved') or public.is_charity_admin(c.charity_id) or public.is_platform_admin())
   group by c.id
$$;

-- One row per donor who has given (a paid gift with something left) to the charity, using the details they typed
-- with their most recent such gift. Totals and counts are what is left.
create or replace function public.charity_donor_list_full(p_charity_id uuid)
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
      where d.charity_id = p_charity_id and d.status = 'paid' and d.amount_cents > d.refunded_cents
    ), latest as (
      select distinct on (p.donor_id) p.donor_id as did, p.dt, p.first_name, p.last_name, p.organisation_name, p.em, p.ph
      from paid p order by p.donor_id, p.paid_at desc
    ), totals as (
      select p.donor_id as did, count(*) as n, sum(p.amount_cents - p.refunded_cents)::bigint as total,
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

-- Each monthly donation's paid count and total: what is left of each payment; a payment with nothing left is not one.
create or replace function public.charity_monthly_list_full(p_charity_id uuid)
returns table (
  recurring_id uuid, status text, retrying boolean, amount_cents bigint, charge_day int,
  next_charge_at timestamptz, started_at timestamptz, last_paid_at timestamptz,
  paid_count bigint, paid_cents bigint, wants_18a boolean, is_anonymous boolean,
  dedication_kind text, dedication_name text,
  donor_type text, display_name text, email text, phone text,
  paused_at timestamptz, ended_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_charity_admin(p_charity_id) or public.is_platform_admin()) then
    raise exception 'Not allowed';
  end if;
  return query
    with seen as (
      select d.recurring_id as rid, d.id as did, d.status as dst, d.amount_cents - d.refunded_cents as amt, d.paid_at,
             (d.status = 'paid' and d.amount_cents > d.refunded_cents) as gave
      from public.donations d
      where d.charity_id = p_charity_id and d.recurring_id is not null
        and d.status in ('paid', 'refunded', 'charged_back')
    ), totals as (
      select s.rid, min(s.paid_at) as first_at, max(s.paid_at) filter (where s.gave) as last_at,
             count(*) filter (where s.gave) as n, coalesce(sum(s.amt) filter (where s.gave), 0)::bigint as total
      from seen s group by s.rid
    ), latest as (
      select distinct on (s.rid) s.rid, c.donor_type::text as dt, c.first_name, c.last_name, c.organisation_name, c.email::text as em, c.phone as ph
      from seen s left join public.donation_checkout_details c on c.donation_id = s.did
      order by s.rid, s.paid_at desc nulls last
    )
    select r.id, r.status::text, (r.status = 'active' and r.failed_attempts > 0), r.amount_cents, r.charge_day,
           case when r.status = 'active' then r.next_charge_at end,
           t.first_at, t.last_at, t.n, t.total, r.wants_18a, r.is_anonymous,
           r.dedication_kind, r.dedication_name,
           l.dt,
           case when coalesce(l.dt, 'individual') = 'individual'
                then nullif(trim(coalesce(l.first_name, '') || ' ' || coalesce(l.last_name, '')), '')
                else nullif(trim(coalesce(l.organisation_name, '')), '') end,
           l.em, l.ph,
           case when r.status = 'paused' then r.paused_at end,
           case when r.status in ('cancelled', 'failed') then coalesce(r.cancelled_at, r.updated_at) end
    from public.recurring_donations r
    join totals t on t.rid = r.id
    left join latest l on l.rid = r.id
    where r.charity_id = p_charity_id
      and r.status in ('active', 'paused', 'failed', 'cancelled')
    order by case r.status when 'active' then 0 when 'paused' then 1 when 'failed' then 2 else 3 end,
             r.amount_cents desc, t.first_at;
end $$;

-- Donors kept and lost: each donor's giving per period is what is left of their paid gifts; a gift with nothing
-- left is not giving.
create or replace function public.charity_keeping_donors_full(p_charity_id uuid, p_last_from timestamptz, p_this_from timestamptz, p_this_to timestamptz, p_now timestamptz)
returns table (
  donor_id uuid, this_cents bigint, last_cents bigint, earlier_cents bigint, after_cents bigint, last_paid_at timestamptz,
  recorded_only boolean, erased boolean, donor_type text, display_name text, email text, phone text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  -- is_charity_admin includes the second step, and refuses a session started with a password.
  if not (public.is_charity_admin(p_charity_id) or public.is_platform_admin()) then
    raise exception 'Not allowed';
  end if;
  if p_last_from is null or p_this_from is null or p_this_to is null or p_now is null
     or not (p_last_from < p_this_from and p_this_from < p_this_to and p_this_from < p_now) then
    raise exception 'A period is needed';
  end if;
  return query
    with paid as (
      select d.id as gid, d.donor_id as did, d.amount_cents - d.refunded_cents as amt, d.paid_at as pat, d.gateway as gw
      from public.donations d
      where d.charity_id = p_charity_id and d.status = 'paid' and d.donor_id is not null
        and d.amount_cents > d.refunded_cents
        and d.paid_at is not null and d.paid_at < greatest(p_this_to, p_now)
    ), totals as (
      select p.did,
             coalesce(sum(p.amt) filter (where p.pat >= p_this_from and p.pat < p_this_to), 0)::bigint as this_c,
             coalesce(sum(p.amt) filter (where p.pat >= p_last_from and p.pat < p_this_from), 0)::bigint as last_c,
             coalesce(sum(p.amt) filter (where p.pat < p_last_from), 0)::bigint as earlier_c,
             coalesce(sum(p.amt) filter (where p.pat >= p_this_to), 0)::bigint as after_c,
             max(p.pat) as last_at,
             bool_and(p.gw = 'recorded') as rec_only
      from paid p group by p.did
    ), latest as (
      select distinct on (p.did) p.did, c.donor_type::text as dt, c.first_name, c.last_name, c.organisation_name,
             c.email::text as em, c.phone as ph
      from paid p left join public.donation_checkout_details c on c.donation_id = p.gid
      order by p.did, p.pat desc, p.gid
    ), gone as (
      -- Erased if any of their gifts here, or their donor record, carries the erased address.
      select p.did, bool_or(coalesce(c.email::text, '') ilike '%@erased.invalid') as any_erased
      from paid p left join public.donation_checkout_details c on c.donation_id = p.gid
      group by p.did
    ), kept as (
      select t.*, l.dt, l.first_name, l.last_name, l.organisation_name, l.em, l.ph,
             (g.any_erased or coalesce(dn.email::text, '') ilike '%@erased.invalid') as er
      from totals t
      join latest l on l.did = t.did
      join gone g on g.did = t.did
      left join public.donors dn on dn.id = t.did
      where t.last_c > 0 or t.earlier_c > 0
    )
    select case when r.er then null else r.did end,
           r.this_c, r.last_c, r.earlier_c, r.after_c,
           case when r.er then null else r.last_at end,
           r.rec_only,
           r.er,
           case when r.er then null else r.dt end,
           case when r.er then null
                when coalesce(r.dt, 'individual') = 'individual'
                then nullif(trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), '')
                else nullif(trim(coalesce(r.organisation_name, '')), '') end,
           case when r.er then null else r.em end,
           case when r.er then null else r.ph end
    from kept r
    order by r.last_c desc, r.earlier_c desc, r.last_at desc, r.did;
end $$;

-- Stopped monthly donations: the last payment, and whether the donor has a page on the dashboard, go by paid gifts
-- with something left.
create or replace function public.charity_lapsed_monthly_full(p_charity_id uuid, p_from timestamptz, p_to timestamptz)
returns table (
  recurring_id uuid, donor_id uuid, amount_cents bigint, ended_at timestamptz, last_paid_at timestamptz,
  reason text, donor_type text, display_name text, email text, phone text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  -- is_charity_admin includes the second step, and refuses a session started with a password.
  if not (public.is_charity_admin(p_charity_id) or public.is_platform_admin()) then
    raise exception 'Not allowed';
  end if;
  if p_from is null or p_to is null then
    raise exception 'A period is needed';
  end if;
  return query
    with seen as (
      select d.recurring_id as rid, d.id as did, d.status as dst, d.paid_at as pat,
             (d.status = 'paid' and d.amount_cents > d.refunded_cents) as gave
      from public.donations d
      where d.charity_id = p_charity_id and d.recurring_id is not null
        and d.status in ('paid', 'refunded', 'charged_back')
    ), totals as (
      select s.rid, min(s.pat) as first_at, max(s.pat) filter (where s.gave) as last_at
      from seen s group by s.rid
    ), latest as (
      select distinct on (s.rid) s.rid, c.donor_type::text as dt, c.first_name, c.last_name, c.organisation_name, c.email::text as em, c.phone as ph
      from seen s left join public.donation_checkout_details c on c.donation_id = s.did
      order by s.rid, s.pat desc nulls last
    ), mine as (
      select r.id as rid, r.donor_id as did, r.status::text as st, r.amount_cents as amt, r.ended_reason as why,
             case when r.status in ('cancelled', 'failed') then coalesce(r.cancelled_at, r.updated_at) end as ended,
             t.first_at, t.last_at
      from public.recurring_donations r
      join totals t on t.rid = r.id
      where r.charity_id = p_charity_id
        and r.status in ('active', 'paused', 'failed', 'cancelled')
    ), stopped as (
      select m.*, l.dt, l.first_name, l.last_name, l.organisation_name, l.em, l.ph,
             (coalesce(l.em, '') ilike '%@erased.invalid' or coalesce(m.why, '') = 'the donor''s information was erased') as erased
      from mine m
      left join latest l on l.rid = m.rid
      where m.st in ('cancelled', 'failed')
        and m.ended >= p_from and m.ended < p_to
        and not exists (
          select 1 from mine o
          where o.did = m.did and o.rid <> m.rid
            and (o.st in ('active', 'paused')
                 or o.first_at > m.first_at
                 or (o.first_at = m.first_at and o.rid > m.rid))
        )
    )
    select s.rid,
           -- Only when the donor has a page on the dashboard (a paid donation with something left), and never for an
           -- erased donor.
           case when not s.erased and exists (
                  select 1 from public.donations p
                  where p.charity_id = p_charity_id and p.donor_id = s.did and p.status = 'paid'
                    and p.amount_cents > p.refunded_cents)
                then s.did end,
           s.amt,
           s.ended,
           case when not s.erased then s.last_at end,
           case when s.erased then 'erased'
                when s.why = 'the payment was charged back' then 'dispute'
                when s.st = 'failed'
                  or s.why in ('the card was declined every time we tried this month', 'the new card can''t be used for monthly payments') then 'declined'
                when s.why = 'cancelled by the donor' then 'cancelled'
                else 'other' end,
           case when not s.erased then s.dt end,
           case when s.erased then null
                when coalesce(s.dt, 'individual') = 'individual'
                then nullif(trim(coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '')), '')
                else nullif(trim(coalesce(s.organisation_name, '')), '') end,
           case when not s.erased then s.em end,
           case when not s.erased then s.ph end
    from stopped s
    order by s.ended desc, s.rid;
end $$;
