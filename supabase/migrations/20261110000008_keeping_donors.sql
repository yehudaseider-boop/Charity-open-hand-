-- Givezy: keeping donors (CRM build step 16, 10/11/2026, from the CRM guidance doc Yehuda shared).
--
-- One row per donor who gave to this charity before the chosen tax year or in the year before it, with what they
-- gave in each of three windows, so the server can work out:
--   - retention: of last tax year's donors, how many gave again this tax year;
--   - "last year but not this" (LYBUNT) and "some year but not since" (SYBUNT);
--   - who gave more and who gave less than last year.
-- The tax-year boundaries come from the server (src/config/platform.ts is the one place the tax year is set), as
-- Johannesburg-midnight timestamps: from p_last_from to p_this_from is last tax year, from p_this_from to p_this_to
-- is the chosen year. p_now is the moment of asking: gifts from p_this_to up to p_now (a donor who came back after a
-- past chosen year) are returned as after_cents, so "not since" really means not since.
--
-- Only paid gifts count: a refunded or charged-back gift doesn't. Gifts the charity recorded itself (gateway
-- 'recorded') count, as everywhere else on the dashboard (charity_donor_list, the overview). A donor who asked to
-- be erased still counts in the numbers, but comes back with no name, contact or donor id. No ID or tax numbers.

create function public.charity_keeping_donors(p_charity_id uuid, p_last_from timestamptz, p_this_from timestamptz, p_this_to timestamptz, p_now timestamptz)
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
      select d.id as gid, d.donor_id as did, d.amount_cents as amt, d.paid_at as pat, d.gateway as gw
      from public.donations d
      where d.charity_id = p_charity_id and d.status = 'paid' and d.donor_id is not null
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

revoke execute on function public.charity_keeping_donors(uuid, timestamptz, timestamptz, timestamptz, timestamptz) from public, anon;
grant execute on function public.charity_keeping_donors(uuid, timestamptz, timestamptz, timestamptz, timestamptz) to authenticated;

-- The counts only, as one row, for the overview's card: the same rules as the lists (src/lib/charity/keeping-donors.ts
-- inList), worked out from the function above so there is one meaning of each list.
--   gave again: last > 0 and this > 0
--   lybunt (gave last tax year, not since): last > 0, this = 0, after = 0
--   sybunt (gave in an earlier year, not since): earlier > 0, last = 0, this = 0, after = 0
--   more: last > 0 and this > last;   less: last > 0 and 0 < this < last
create function public.charity_keeping_summary(p_charity_id uuid, p_last_from timestamptz, p_this_from timestamptz, p_this_to timestamptz, p_now timestamptz)
returns table (
  last_year_donors bigint, gave_again bigint, lybunt bigint, sybunt bigint, gave_more bigint, gave_less bigint, lybunt_last_cents bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  -- charity_keeping_donors checks who is asking and the period again; checked here first for a plain refusal.
  if not (public.is_charity_admin(p_charity_id) or public.is_platform_admin()) then
    raise exception 'Not allowed';
  end if;
  return query
    select count(*) filter (where k.last_cents > 0),
           count(*) filter (where k.last_cents > 0 and k.this_cents > 0),
           count(*) filter (where k.last_cents > 0 and k.this_cents = 0 and k.after_cents = 0),
           count(*) filter (where k.earlier_cents > 0 and k.last_cents = 0 and k.this_cents = 0 and k.after_cents = 0),
           count(*) filter (where k.last_cents > 0 and k.this_cents > k.last_cents),
           count(*) filter (where k.last_cents > 0 and k.this_cents > 0 and k.this_cents < k.last_cents),
           coalesce(sum(k.last_cents) filter (where k.last_cents > 0 and k.this_cents = 0 and k.after_cents = 0), 0)::bigint
    from public.charity_keeping_donors(p_charity_id, p_last_from, p_this_from, p_this_to, p_now) k;
end $$;

revoke execute on function public.charity_keeping_summary(uuid, timestamptz, timestamptz, timestamptz, timestamptz) from public, anon;
grant execute on function public.charity_keeping_summary(uuid, timestamptz, timestamptz, timestamptz, timestamptz) to authenticated;
