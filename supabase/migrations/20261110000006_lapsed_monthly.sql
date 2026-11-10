-- Givezy: monthly donors who stopped, for a charity to contact them (10/11/2026, CRM build step 4).
--
-- "Stopped" is the dashboard's existing meaning, from charity_monthly_list: the monthly donation is
-- cancelled or failed (the card was declined every time), it had at least one payment go through, and
-- it ended at coalesce(cancelled_at, updated_at). Paused is not stopped.
--
-- A donor is left out when they still give monthly to this charity another way: they have another
-- monthly donation here that is running or paused, or one that started later (that later one is then
-- the row that counts, if it has stopped too). So each donor appears at most once.
--
-- The charity sees no more than it already does on its Monthly and Donors pages: the name, email and
-- phone typed at the latest payment. The stored reason text stays private; only a plain category comes
-- back. A donor who asked to be erased comes back with the amount and the end date and nothing else.

create function public.charity_lapsed_monthly(p_charity_id uuid, p_from timestamptz, p_to timestamptz)
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
      select d.recurring_id as rid, d.id as did, d.status as dst, d.paid_at as pat
      from public.donations d
      where d.charity_id = p_charity_id and d.recurring_id is not null
        and d.status in ('paid', 'refunded', 'charged_back')
    ), totals as (
      select s.rid, min(s.pat) as first_at, max(s.pat) filter (where s.dst = 'paid') as last_at
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
           -- Only when the donor has a page on the dashboard (a paid donation), and never for an erased donor.
           case when not s.erased and exists (
                  select 1 from public.donations p
                  where p.charity_id = p_charity_id and p.donor_id = s.did and p.status = 'paid')
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

revoke execute on function public.charity_lapsed_monthly(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.charity_lapsed_monthly(uuid, timestamptz, timestamptz) to authenticated;
