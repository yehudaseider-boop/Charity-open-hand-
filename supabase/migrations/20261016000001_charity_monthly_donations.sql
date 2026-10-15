-- Givezy: monthly donations for charities (16/10/2026).
-- A charity sees its monthly donors: who, how much, which day, how many months collected, and
-- whether it is running, paused, stopped (the card was declined every time) or cancelled.
-- Read through this function only: the raw rows hold the gateway references and the card details,
-- and the donor's contribution to Givezy and their maaser/chomesh/tzedaka choice stay private.
-- Like donations, a monthly donation appears only once a payment from it has gone through, and
-- the donor's details are those typed at their latest such payment.

create or replace function public.charity_monthly_list(p_charity_id uuid)
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
      select d.recurring_id as rid, d.id as did, d.status as dst, d.amount_cents as amt, d.paid_at
      from public.donations d
      where d.charity_id = p_charity_id and d.recurring_id is not null
        and d.status in ('paid', 'refunded', 'charged_back')
    ), totals as (
      select s.rid, min(s.paid_at) as first_at, max(s.paid_at) filter (where s.dst = 'paid') as last_at,
             count(*) filter (where s.dst = 'paid') as n, coalesce(sum(s.amt) filter (where s.dst = 'paid'), 0)::bigint as total
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
revoke execute on function public.charity_monthly_list(uuid) from public, anon;
grant execute on function public.charity_monthly_list(uuid) to authenticated;
