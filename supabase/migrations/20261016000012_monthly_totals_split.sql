-- Givezy: donations by month, split into monthly and once-off (16/10/2026, charity insights).
-- Same rules as before: paid donations only, the contribution to Givezy never included,
-- months in Johannesburg time. The new column is the part that came from monthly donations.

drop function public.charity_monthly_totals(uuid, int);

create function public.charity_monthly_totals(p_charity_id uuid, p_months int default 24)
returns table (month date, donation_count bigint, amount_cents bigint, monthly_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_charity_admin(p_charity_id) or public.is_platform_admin()) then
    raise exception 'Not allowed';
  end if;
  return query
    select (date_trunc('month', d.paid_at at time zone 'Africa/Johannesburg'))::date as month,
           count(*),
           coalesce(sum(d.amount_cents), 0)::bigint,
           coalesce(sum(d.amount_cents) filter (where d.recurring_id is not null), 0)::bigint
    from public.donations d
    where d.charity_id = p_charity_id and d.status = 'paid' and d.paid_at is not null
    group by 1
    order by 1 desc
    limit greatest(1, least(coalesce(p_months, 24), 120));
end $$;

revoke execute on function public.charity_monthly_totals(uuid, int) from public, anon;
grant execute on function public.charity_monthly_totals(uuid, int) to authenticated;
