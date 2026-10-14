-- Review fixes, 14/10/2026.
--
-- 1. Erasing a donor always marks their monthly donations as ended by the erasure. Before, a
--    monthly donation already closed as "the first payment failed" kept that reason, and a late
--    successful first payment could then start it again for an erased donor.
create or replace function public.erase_donor_data(p_donor_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  emails text[];
  refs text[];
  n_donors int; n_details int; n_monthly int; n_events int; n_kinds int; n_messages int;
begin
  if p_donor_ids is null or cardinality(p_donor_ids) = 0 then
    return jsonb_build_object('donors', 0);
  end if;

  select coalesce(array_agg(distinct lower(email::text)), '{}') into emails
    from (select email from public.donors where id = any (p_donor_ids)
          union select c.email from public.donation_checkout_details c
                join public.donations d on d.id = c.donation_id where d.donor_id = any (p_donor_ids)) e;
  select coalesce(array_agg(gateway_ref), '{}') into refs
    from public.donations where donor_id = any (p_donor_ids) and gateway_ref is not null;

  -- Monthly donations stop, and the stored card is destroyed.
  update public.recurring_donations
     set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), authorization_encrypted = null,
         ended_reason = 'the donor''s information was erased', message = null,
         card_last4 = null, card_brand = null, card_exp = null, needs_gateway_sync = false
   where donor_id = any (p_donor_ids);
  get diagnostics n_monthly = row_count;

  -- Free text the donor wrote.
  update public.donations set message = null where donor_id = any (p_donor_ids) and message is not null;
  get diagnostics n_messages = row_count;

  -- The private maaser / chomesh / tzedaka choice and the confirmation links.
  delete from public.donation_giving_kinds where donation_id in (select id from public.donations where donor_id = any (p_donor_ids));
  get diagnostics n_kinds = row_count;
  delete from public.donation_confirmations where donation_id in (select id from public.donations where donor_id = any (p_donor_ids));

  -- Who they are, as typed at each checkout. Amounts and dates stay on the donations.
  update public.donation_checkout_details c
     set email = 'erased+' || c.donation_id::text || '@erased.invalid',
         first_name = null, last_name = null, organisation_name = null, registration_number = null,
         contact_person = null, phone = null, id_number_encrypted = null, id_number_last4 = null,
         tax_reference_encrypted = null, tax_reference_last4 = null, address_line1 = null, address_line2 = null,
         suburb = null, city = null, postal_code = null, receipt_identity = null, erased_at = now()
   where c.donation_id in (select id from public.donations where donor_id = any (p_donor_ids));
  get diagnostics n_details = row_count;

  -- The donor record itself.
  update public.donors
     set email = 'erased+' || id::text || '@erased.invalid', email_verified_at = null,
         first_name = null, last_name = null, phone = null, registration_number = null,
         organisation_name = case when donor_type = 'individual' then null else 'Erased' end,
         contact_person = null, id_number_encrypted = null, id_number_last4 = null,
         tax_reference_encrypted = null, tax_reference_last4 = null, address_line1 = null, address_line2 = null,
         suburb = null, city = null, postal_code = null, date_of_birth = null, user_id = null, erased_at = now()
   where id = any (p_donor_ids);
  get diagnostics n_donors = row_count;

  -- The gateway's raw records of their payments keep the reference and event, not the customer.
  update public.gateway_events
     set payload = jsonb_build_object(
           'event', payload->>'event',
           'reference', coalesce(payload->'data'->>'reference', payload->>'reference'),
           'redacted', true)
   where coalesce(payload->'data'->>'reference', payload->>'reference') = any (refs)
     and coalesce(payload->>'redacted', 'false') <> 'true';
  get diagnostics n_events = row_count;

  -- Their address in the rate limiter's short-lived records.
  delete from public.rate_limit_events where key = any (select 'email:' || e from unnest(emails) e);

  return jsonb_build_object('donors', n_donors, 'checkout_details', n_details, 'monthly_stopped', n_monthly,
                            'giving_choices', n_kinds, 'messages', n_messages, 'gateway_records', n_events);
end $$;
revoke execute on function public.erase_donor_data(uuid[]) from public, anon, authenticated;
grant execute on function public.erase_donor_data(uuid[]) to service_role;

-- 2. A charity's signed declarations stay with the charity when the person who signed them
--    deletes their account: the record keeps the charity and loses the person.
alter table public.consents drop constraint consent_has_subject;
alter table public.consents add constraint consent_has_subject check (
  (kind = 'account' and user_id is not null)
  or (kind in ('donation', 'monthly_authorisation') and donation_id is not null)
  or (kind = 'charity_declarations' and charity_id is not null)
);

-- 3. Removing a monthly donation that already stopped (card declined) keeps the real reason.
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
         -- Removing a stopped one keeps the real reason ("the card was declined ...") for the record.
         ended_reason = case when p_status = 'cancelled' and cur <> 'failed' then 'cancelled by the donor' else ended_reason end,
         next_charge_at = case when p_status = 'active' then new_next else next_charge_at end,
         needs_gateway_sync = false
   where id = p_id;
end $$;
revoke execute on function public.set_my_recurring_status(uuid, text) from public, anon;
grant execute on function public.set_my_recurring_status(uuid, text) to authenticated;
