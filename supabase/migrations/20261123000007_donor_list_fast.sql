-- Givezy: the donor list reads only the columns it uses (23/11/2026, Yehuda: "fix the slow donor list first").
--
-- charity_donor_list_full (latest: 20261120000003_part_refunds_in_totals.sql) built its "paid" step with d.*, so every
-- column of every paid gift (about 540 bytes a row) was carried through, spilled to disk past the database's working
-- memory, and read twice. On the test project's load-test charity (3 000 donors, 20 000 gifts) that took 1.5 to 2.2 s,
-- and the donor list asks for it once per 1 000 donors, so the page took 6 to over 30 s (end-to-end check
-- dashboard-size.e2e.ts, 23/11/2026). The same query with only the columns used took about 56 ms there.
--
-- Same name, arguments, columns, order, security definer, search_path and permission check as before; the totals are
-- still what is left after part refunds. create or replace keeps its grants, and the wrapper charity_donor_list
-- (20261119000002) reads it unchanged.

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
      select d.donor_id, d.paid_at, d.amount_cents - d.refunded_cents as kept, d.wants_18a, d.is_anonymous,
             c.donor_type as dt, c.first_name, c.last_name, c.organisation_name, c.email as em, c.phone as ph
      from public.donations d
      join public.donation_checkout_details c on c.donation_id = d.id
      where d.charity_id = p_charity_id and d.status = 'paid' and d.amount_cents > d.refunded_cents
    ), latest as (
      select distinct on (p.donor_id) p.donor_id as did, p.dt, p.first_name, p.last_name, p.organisation_name, p.em, p.ph
      from paid p order by p.donor_id, p.paid_at desc
    ), totals as (
      select p.donor_id as did, count(*) as n, sum(p.kept)::bigint as total,
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
