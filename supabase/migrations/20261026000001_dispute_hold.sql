-- Givezy: a monthly donation paused because a payment on it was disputed (a chargeback opened) stays
-- paused until a person has looked (26/10/2026, code check).
--
-- Until now the pause looked exactly like the donor's own pause, so the donor could press Resume and the
-- next collection would charge the disputed card again (inviting a second chargeback). The hold is set by
-- the server when a dispute opens and released by a platform admin once the dispute is won; a lost dispute
-- marks the payment charged back, which stops the monthly donation for good. The donor can still cancel.

alter table public.recurring_donations add column held_reason text;

comment on column public.recurring_donations.held_reason is
  'Set by the server while a person looks into a disputed payment. While set, the donor cannot resume it.';

CREATE OR REPLACE FUNCTION public.set_my_recurring_status(p_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := (select auth.uid());
  cur public.recurring_status;
  r_day int;
  r_paid text;
  has_card boolean;
  r_held text;
  this_month timestamp := date_trunc('month', now() at time zone 'Africa/Johannesburg');
  this_charge timestamptz;
  new_next timestamptz;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if not public.signed_in_without_password() then raise exception 'Please sign in with the emailed code'; end if;
  if p_status not in ('active', 'paused', 'cancelled') then raise exception 'Unknown status'; end if;

  select r.status, r.charge_day, r.last_paid_period, r.authorization_encrypted is not null, r.held_reason
    into cur, r_day, r_paid, has_card, r_held
  from public.recurring_donations r
  join public.donors d on d.id = r.donor_id
  where r.id = p_id and d.user_id = uid
  for update of r;
  if not found then raise exception 'Monthly donation not found'; end if;

  if cur::text = p_status then return; end if;
  if not (
       (cur = 'active' and p_status in ('paused', 'cancelled'))
    or (cur = 'failed' and p_status = 'cancelled')
    or (cur = 'paused' and p_status in ('active', 'cancelled'))
    or (cur = 'pending' and p_status = 'cancelled')
  ) then
    raise exception 'A % monthly donation cannot be set to %', cur, p_status;
  end if;
  if p_status = 'active' and r_held is not null then
    raise exception 'This monthly donation is paused while a payment on it is looked into. Givezy will be in touch.';
  end if;
  if p_status = 'active' and not has_card then
    raise exception 'This monthly donation has no card to charge. Start a new monthly donation instead.';
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
         -- Removing a stopped one keeps the real reason ("the card was declined ...") for the record.
         ended_reason = case when p_status = 'cancelled' and cur <> 'failed' then 'cancelled by the donor' else ended_reason end,
         next_charge_at = case when p_status = 'active' then new_next else next_charge_at end,
         -- A resumed donation gets the full number of tries again.
         attempt_period = case when p_status = 'active' then null else attempt_period end,
         failed_attempts = case when p_status = 'active' then 0 else failed_attempts end,
         needs_gateway_sync = false
   where id = p_id;
end $function$
;

revoke execute on function public.set_my_recurring_status(uuid, text) from public, anon;
grant execute on function public.set_my_recurring_status(uuid, text) to authenticated;

-- The donor's own pages read it, to say why Resume is not offered.
grant select (held_reason) on public.recurring_donations to authenticated;
