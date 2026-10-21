-- Givezy: insights for charities (16/10/2026, Yehuda: from Givelify's analytics).
-- Counts only, for the charity's own admins: who is new, who comes back, how many give monthly.
-- Paid donations only. The contribution to Givezy is never included.

create function public.charity_insights(p_charity_id uuid, p_from timestamptz, p_to timestamptz)
returns table (
  new_donors bigint,
  returning_donors bigint,
  repeat_donors bigint,
  all_donors bigint,
  monthly_active bigint,
  monthly_active_cents bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_charity_admin(p_charity_id) or public.is_platform_admin()) then
    raise exception 'Not allowed';
  end if;
  return query
    with paid as (
      select d.donor_id, d.paid_at from public.donations d
       where d.charity_id = p_charity_id and d.status = 'paid' and d.paid_at is not null
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
revoke execute on function public.charity_insights(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.charity_insights(uuid, timestamptz, timestamptz) to authenticated;
