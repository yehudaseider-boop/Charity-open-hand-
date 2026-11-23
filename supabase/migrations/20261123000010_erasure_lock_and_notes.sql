-- Givezy: erasure and the issued-receipt check (review 23/11/2026, area D).
--
-- erase_donor_data decided "is this gift on an issued s18A receipt?" in two separate statements without locking the
-- donations, while issue_s18a_receipt locks them (in id order). A receipt issued between the two statements could
-- leave a gift's names and ID cleared that the receipt then relied on. The donor's donations are now locked first, in
-- id order (the same order, so the two cannot deadlock), so the check and the clearing see one state.
-- It also clears the private note a charity wrote on a receipt decision about the donor, and removes the donor's
-- rows from the charities' appeal send lists (the appeal itself stays). Otherwise the same function as
-- 20261123000006_erasure_fixes.sql, copied exactly.

create or replace function public.erase_donor_data(p_donor_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  emails text[];
  refs text[];
  n_donors int; n_details int; n_kept int; n_monthly int; n_events int; n_kinds int; n_messages int;
begin
  if p_donor_ids is null or cardinality(p_donor_ids) = 0 then
    return jsonb_build_object('donors', 0);
  end if;

  -- Lock their gifts first, in id order like issue_s18a_receipt, so "on an issued receipt?" cannot change under us.
  perform 1 from public.donations where donor_id = any (p_donor_ids) order by id for update;

  -- Every email they used, on the donor record and at each checkout (repeats are harmless below).
  emails := array(select lower(email::text) from public.donors where id = any (p_donor_ids))
         || array(select lower(c.email::text) from public.donation_checkout_details c
                    join public.donations d on d.id = c.donation_id where d.donor_id = any (p_donor_ids));
  select coalesce(array_agg(gateway_ref), '{}') into refs
    from public.donations where donor_id = any (p_donor_ids) and gateway_ref is not null;

  -- Monthly donations stop, and the stored card is destroyed.
  update public.recurring_donations
     set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), authorization_encrypted = null,
         ended_reason = 'the donor''s information was erased', message = null, dedication_kind = null, dedication_name = null,
         card_last4 = null, card_brand = null, card_exp = null, needs_gateway_sync = false,
         gateway_customer_ref = null, gateway_subscription_ref = null,
         id_number_carry_encrypted = null, id_number_carry_last4 = null, receipt_identity_carry = null
   where donor_id = any (p_donor_ids);
  get diagnostics n_monthly = row_count;

  -- Free text the donor wrote (a message, a campaign answer), and any dedication (the name of someone they honoured or remembered).
  update public.donations set message = null, dedication_kind = null, dedication_name = null, campaign_answer = null
   where donor_id = any (p_donor_ids) and (message is not null or dedication_name is not null or campaign_answer is not null);
  get diagnostics n_messages = row_count;

  -- The private maaser / chomesh / tzedaka choice and the confirmation links.
  delete from public.donation_giving_kinds where donation_id in (select id from public.donations where donor_id = any (p_donor_ids));
  get diagnostics n_kinds = row_count;
  delete from public.donation_confirmations where donation_id in (select id from public.donations where donor_id = any (p_donor_ids));

  -- What a charity wrote about them on a receipt decision (its private note), and their place on its appeal send lists.
  update public.receipt_plan_decisions set note = null where donor_id = any (p_donor_ids) and note is not null;
  delete from public.charity_appeal_recipients where donor_id = any (p_donor_ids);

  -- Who they are, as typed at each checkout. Amounts and dates stay on the donations.
  -- A gift on an issued s18A receipt keeps what the charity must report to SARS (IT3(d)): names, the ID, tax
  -- and registration numbers, and the address. The rest goes.
  update public.donation_checkout_details c
     set email = 'erased+' || c.donation_id::text || '@erased.invalid',
         contact_person = null, phone = null, id_number_last4 = null, tax_reference_last4 = null,
         receipt_identity = null, erased_at = now()
   where c.donation_id in (select id from public.donations where donor_id = any (p_donor_ids))
     and exists (select 1 from public.s18a_receipt_donations l join public.s18a_receipts r on r.id = l.receipt_id
                  where l.donation_id = c.donation_id and r.status = 'issued');
  get diagnostics n_kept = row_count;

  update public.donation_checkout_details c
     set email = 'erased+' || c.donation_id::text || '@erased.invalid',
         first_name = null, last_name = null, organisation_name = null, registration_number = null,
         contact_person = null, phone = null, id_number_encrypted = null, id_number_last4 = null,
         tax_reference_encrypted = null, tax_reference_last4 = null, address_line1 = null, address_line2 = null,
         suburb = null, city = null, postal_code = null, receipt_identity = null, erased_at = now()
   where c.donation_id in (select id from public.donations where donor_id = any (p_donor_ids))
     and not exists (select 1 from public.s18a_receipt_donations l join public.s18a_receipts r on r.id = l.receipt_id
                      where l.donation_id = c.donation_id and r.status = 'issued');
  get diagnostics n_details = row_count;
  n_details := n_details + n_kept;

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

  return jsonb_build_object('donors', n_donors, 'checkout_details', n_details, 'monthly_stopped', n_monthly,
                            'giving_choices', n_kinds, 'messages', n_messages, 'gateway_records', n_events);
end $$;
revoke execute on function public.erase_donor_data(uuid[]) from public, anon, authenticated;
grant execute on function public.erase_donor_data(uuid[]) to service_role;
