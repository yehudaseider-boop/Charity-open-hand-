-- Monthly giving (13/10/2026).
--
-- A donor's first monthly payment is an ordinary card payment. The gateway then returns a
-- reusable card authorisation, which we keep (encrypted, server-only) and use to collect the
-- same amount once a month, from our own scheduled job. The donor can pause or cancel at any
-- time; cancelling destroys the stored authorisation.

alter type public.recurring_status add value if not exists 'pending';  -- waiting for the first payment

alter table public.recurring_donations
  add column contribution_cents bigint not null default 0 check (contribution_cents >= 0),
  add column first_donation_id uuid references public.donations (id),
  -- Day of the month to collect on (Johannesburg). 29-31 collect on the last day of shorter months.
  add column charge_day integer check (charge_day between 1 and 31),
  -- The reusable card authorisation, encrypted with the server key. Never readable by any client.
  add column authorization_encrypted text,
  add column card_brand text,
  add column card_last4 text check (card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  add column card_exp text,
  -- The month ("yyyy-mm", Johannesburg) last collected, and the month now being attempted.
  add column last_paid_period text check (last_paid_period is null or last_paid_period ~ '^[0-9]{4}-[0-9]{2}$'),
  add column attempt_period text check (attempt_period is null or attempt_period ~ '^[0-9]{4}-[0-9]{2}$'),
  add column failed_attempts integer not null default 0 check (failed_attempts >= 0),
  add column last_attempt_at timestamptz,
  add column ended_reason text;

create index recurring_due_idx on public.recurring_donations (next_charge_at) where status = 'active';
create index recurring_first_donation_idx on public.recurring_donations (first_donation_id);

-- The authorisation is a token that can charge a card: no client may read it, not even its owner.
revoke select on public.recurring_donations from authenticated;
grant select (
  id, donor_id, charity_id, campaign_id, amount_cents, contribution_cents, status, wants_18a, is_anonymous,
  message, gateway, gateway_subscription_ref, gateway_customer_ref, next_charge_at, paused_at, cancelled_at,
  created_at, updated_at, needs_gateway_sync, first_donation_id, charge_day, card_brand, card_last4, card_exp,
  last_paid_period, failed_attempts, ended_reason
) on public.recurring_donations to authenticated;

-- The donor's authorisation to collect monthly is recorded with the first donation.
alter table public.consents drop constraint consents_kind_check;
alter table public.consents add constraint consents_kind_check check (kind in (
  'account', 'donation', 'charity_declarations',
  'monthly_authorisation'  -- donor authorised collecting the same amount every month until they cancel
));
alter table public.consents drop constraint consent_has_subject;
alter table public.consents add constraint consent_has_subject check (
  (kind = 'account' and user_id is not null)
  or (kind in ('donation', 'monthly_authorisation') and donation_id is not null)
  or (kind = 'charity_declarations' and charity_id is not null and user_id is not null)
);

-- The collection job is the one that takes the monthly payments, so there is nothing to
-- "tell the payment provider" when a donor pauses or cancels: it takes effect at once.
-- Cancelling also destroys the stored card authorisation.
create or replace function public.set_my_recurring_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  cur public.recurring_status;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if p_status not in ('active', 'paused', 'cancelled') then raise exception 'Unknown status'; end if;

  select r.status into cur
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

  update public.recurring_donations
     set status = p_status::public.recurring_status,
         paused_at = case p_status when 'paused' then now() when 'active' then null else paused_at end,
         cancelled_at = case p_status when 'cancelled' then now() else cancelled_at end,
         authorization_encrypted = case p_status when 'cancelled' then null else authorization_encrypted end,
         ended_reason = case p_status when 'cancelled' then 'cancelled by the donor' else ended_reason end,
         needs_gateway_sync = false
   where id = p_id;
end $$;
revoke execute on function public.set_my_recurring_status(uuid, text) from public, anon;
grant execute on function public.set_my_recurring_status(uuid, text) to authenticated;
