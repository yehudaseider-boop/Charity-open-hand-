-- Givezy: code review fixes, database (20/10/2026).

-- 1. Donor records no longer hold ID or income tax numbers (20261015000004), so signed-in users may not write
--    those columns either: nothing pasted in can ever be a value the server decrypts.
revoke update (id_number_encrypted, id_number_last4, tax_reference_encrypted, tax_reference_last4) on public.donors from authenticated;

-- 2. Approval fields change only on the server. The guard trigger already refuses a charity admin changing
--    them; the column grant now says the same, so there is one less thing to rely on.
revoke update (is_s18a, s18a_confirmed_at, mandate_signed_at, mandate_document_path) on public.charities from authenticated;

-- 3. A charity's logo and cover picture come from its own folder in the public bucket, like its photos.
alter table public.charities
  add constraint charities_logo_own_folder check (logo_path is null or (logo_path like id::text || '/%' and logo_path not like '%..%')),
  add constraint charities_cover_own_folder check (cover_path is null or (cover_path like id::text || '/%' and cover_path not like '%..%'));

-- 4. An active monthly donation always has a charge day (resuming one without would schedule nothing).
alter table public.recurring_donations
  add constraint recurring_active_has_charge_day check (status <> 'active' or charge_day is not null);

-- 5. Money is bigint everywhere, this legacy column included.
alter table public.fee_settings alter column gateway_fixed_cents type bigint;

-- 6. Indexes for the lookups the website and jobs make.
create index if not exists donations_recurring_idx on public.donations (recurring_id) where recurring_id is not null;
create index if not exists donations_campaign_idx on public.donations (campaign_id) where campaign_id is not null;
create index if not exists recurring_charity_idx on public.recurring_donations (charity_id);
create index if not exists charity_admins_user_idx on public.charity_admins (user_id);
create index if not exists s18a_receipts_year_status_idx on public.s18a_receipts (tax_year, status);
create index if not exists consents_charity_idx on public.consents (charity_id) where charity_id is not null;

-- 7. Erasure also clears a campaign answer (free text the donor typed), should campaigns ever be switched on.
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
         gateway_customer_ref = null, gateway_subscription_ref = null
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
