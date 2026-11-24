-- Givezy: the charity dashboard's Annual report works out its figures in the database (24/11/2026).
--
-- The Report page (src/app/charity-admin/[id]/report) and its CSV read every paid, refunded or charged-back gift of the
-- charity through charity_donations (about 20 000 on the test project's load-test charity, five rounds of four
-- requests) and worked the figures out in JavaScript (src/lib/charity/annual-report.ts, annualReport and reportYears).
-- This function gives the same figures for one tax year as one small answer.
--
-- The rules are the JavaScript's, line for line:
--   * a gift's tax year is its tax_year, else the tax year of paid_at in p_time_zone (taxYearFor: the year it ends,
--     a month at or after p_start_month belongs to the next year);
--   * the years listed are every year with a paid, refunded or charged-back gift, plus p_current_year; the year
--     answered is p_asked_year when listed, else the latest;
--   * a gift counts when it is paid with something left after part refunds (countsAsGift), for what is left;
--   * a donor is new when their first counted gift ever to this charity is in the year;
--   * months are the twelve calendar months of the tax year in p_time_zone (saDate);
--   * refunded: refunded or charged-back gifts whole, and part refunds of paid gifts;
--   * s18A: donors who asked on a counted gift, and those with a counted asked-for gift not on an issued receipt.
-- Tax-year values and the time zone come from src/config/platform.ts, passed in, never written here.
--
-- Who may ask: exactly who may read the charity's gifts through charity_donations (20261119000001): someone on the
-- charity's team, or a Givezy admin (is_charity_admin or is_platform_admin, each with the second step done). Same
-- security definer, search_path, refusal and grants as charity_keeping_summary (20261110000008).
--
-- The page falls back to reading the gifts when this function is not there yet (isMissingFunction), so the code works
-- before and after this migration.

create or replace function public.charity_report_summary(
  p_charity_id uuid, p_asked_year int, p_current_year int, p_start_month int, p_time_zone text
)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_result jsonb;
begin
  if not (public.is_charity_admin(p_charity_id) or public.is_platform_admin()) then
    raise exception 'Not allowed';
  end if;
  if p_start_month is null or p_start_month not between 1 and 12 or p_time_zone is null or p_current_year is null then
    raise exception 'Bad report settings';
  end if;

  -- One read of the charity's gifts, with only the columns used.
  with g as materialized (
    select d.id, d.donor_id, d.status::text as status, d.amount_cents, d.refunded_cents,
           greatest(d.amount_cents - d.refunded_cents, 0) as kept,
           d.paid_at at time zone p_time_zone as paid_local,
           coalesce(d.tax_year,
             case when d.paid_at is null then null
                  else extract(year from d.paid_at at time zone p_time_zone)::int
                       + case when extract(month from d.paid_at at time zone p_time_zone)::int >= p_start_month then 1 else 0 end
             end) as ty,
           d.recurring_id is not null as recurring, d.campaign_id, d.wants_18a is true as wants_18a
    from public.donations d
    where d.charity_id = p_charity_id and d.status in ('paid', 'refunded', 'charged_back')
  ), years as (
    select array_agg(t.y order by t.y desc) as list
    from (select g.ty as y from g where g.ty is not null union select p_current_year) t
  ), chosen as (
    select case when p_asked_year = any (years.list) then p_asked_year else years.list[1] end as y, years.list
    from years
  ), counted as (
    select g.* from g where g.status = 'paid' and g.kept > 0
  ), paid as (
    select c.* from counted c, chosen where c.ty = chosen.y
  ), new_donors as (
    -- A donor whose first counted gift ever is in the year is one of the year's donors, so no join is needed.
    select count(*) as n from (select c.donor_id from counted c group by c.donor_id having min(c.ty) = (select y from chosen)) f
  ), asked as (
    select p.*, exists (
      select 1 from public.s18a_receipt_donations rd join public.s18a_receipts r on r.id = rd.receipt_id
      where rd.donation_id = p.id and r.charity_id = p_charity_id and r.status = 'issued'
    ) as issued
    from paid p where p.wants_18a
  ), month_lines as (
    select to_char(p.paid_local, 'YYYY-MM') as month, sum(p.kept)::bigint as cents, count(*) as n
    from paid p, chosen
    where p.paid_local >= make_date(chosen.y - 1, p_start_month, 1)
      and p.paid_local < make_date(chosen.y - 1, p_start_month, 1) + interval '12 months'
    group by 1
  ), campaign_lines as (
    -- Ties keep the JavaScript's order: first seen when the gifts are read in id order.
    select p.campaign_id as cid, sum(p.kept)::bigint as cents, count(*) as n, (array_agg(p.id order by p.id))[1] as first_id
    from paid p where p.campaign_id is not null group by p.campaign_id
  ), undone as (
    select g.* from g, chosen
    where g.ty = chosen.y and (g.status in ('refunded', 'charged_back') or (g.status = 'paid' and g.refunded_cents > 0))
  )
  select jsonb_build_object(
    'tax_year', chosen.y,
    'years', to_jsonb(chosen.list),
    'total_cents', (select coalesce(sum(p.kept), 0)::bigint from paid p),
    'donation_count', (select count(*) from paid p),
    'donors', (select count(distinct p.donor_id) from paid p),
    'new_donors', (select n from new_donors),
    'monthly_cents', (select coalesce(sum(p.kept), 0)::bigint from paid p where p.recurring),
    'months', coalesce((select jsonb_agg(jsonb_build_object('month', m.month, 'cents', m.cents, 'count', m.n) order by m.month) from month_lines m), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(jsonb_build_object('id', c.cid, 'cents', c.cents, 'count', c.n) order by c.cents desc, c.first_id) from campaign_lines c), '[]'::jsonb),
    -- A refunded or charged-back gift is taken back whole; a paid gift for what was refunded of it in parts.
    'refunded_count', (select count(*) from undone u),
    'refunded_cents', (select coalesce(sum(case when u.status = 'paid' then u.refunded_cents else u.amount_cents end), 0)::bigint from undone u),
    's18a_donors', (select count(distinct a.donor_id) from asked a),
    's18a_waiting_donors', (select count(distinct a.donor_id) from asked a where not a.issued),
    's18a_waiting_cents', (select coalesce(sum(a.kept), 0)::bigint from asked a where not a.issued)
  ) into v_result
  from chosen;

  return v_result;
end $$;

revoke execute on function public.charity_report_summary(uuid, int, int, int, text) from public, anon;
grant execute on function public.charity_report_summary(uuid, int, int, int, text) to authenticated;
