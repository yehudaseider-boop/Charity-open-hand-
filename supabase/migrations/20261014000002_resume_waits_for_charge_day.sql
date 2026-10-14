-- A monthly donation that is resumed waits for its charge day, 13/10/2026.
--
-- Before: pausing left the old collection time in place, so resuming on the 20th a donation
-- with charge day 15 was collected within the hour. Now a resumed donation is collected on its
-- charge day: this month's if that is still ahead and the month is not already collected,
-- otherwise next month's. (08:00 Johannesburg time = 06:00 UTC, as in src/lib/donations/schedule.ts.)
create or replace function public.monthly_charge_time(p_month_start timestamp, p_day int) returns timestamptz
language sql immutable set search_path = '' as $$
  select (p_month_start
          + (least(p_day, extract(day from (p_month_start + interval '1 month' - interval '1 day'))::int) - 1) * interval '1 day'
          + time '06:00') at time zone 'UTC'
$$;

create or replace function public.set_my_recurring_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  cur public.recurring_status;
  r_day int;
  r_paid text;
  this_month timestamp := date_trunc('month', now() at time zone 'Africa/Johannesburg');
  this_charge timestamptz;
  new_next timestamptz;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if p_status not in ('active', 'paused', 'cancelled') then raise exception 'Unknown status'; end if;

  select r.status, r.charge_day, r.last_paid_period into cur, r_day, r_paid
  from public.recurring_donations r
  join public.donors d on d.id = r.donor_id
  where r.id = p_id and d.user_id = uid
  for update of r;
  if not found then raise exception 'Monthly donation not found'; end if;

  if cur::text = p_status then return; end if;
  if not (
       (cur in ('active', 'failed') and p_status in ('paused', 'cancelled'))
    or (cur = 'paused' and p_status in ('active', 'cancelled'))
    or (cur = 'pending' and p_status = 'cancelled')
  ) then
    raise exception 'A % monthly donation cannot be set to %', cur, p_status;
  end if;

  if p_status = 'active' then
    this_charge := public.monthly_charge_time(this_month, r_day);
    new_next := case
      when r_paid is distinct from to_char(this_month, 'YYYY-MM') and this_charge > now() then this_charge
      else public.monthly_charge_time(this_month + interval '1 month', r_day)
    end;
  end if;

  update public.recurring_donations
     set status = p_status::public.recurring_status,
         paused_at = case p_status when 'paused' then now() when 'active' then null else paused_at end,
         cancelled_at = case p_status when 'cancelled' then now() else cancelled_at end,
         authorization_encrypted = case p_status when 'cancelled' then null else authorization_encrypted end,
         ended_reason = case p_status when 'cancelled' then 'cancelled by the donor' else ended_reason end,
         next_charge_at = case when p_status = 'active' then new_next else next_charge_at end,
         needs_gateway_sync = false
   where id = p_id;
end $$;
revoke execute on function public.set_my_recurring_status(uuid, text) from public, anon;
grant execute on function public.set_my_recurring_status(uuid, text) to authenticated;
revoke execute on function public.monthly_charge_time(timestamp, int) from public, anon, authenticated;
