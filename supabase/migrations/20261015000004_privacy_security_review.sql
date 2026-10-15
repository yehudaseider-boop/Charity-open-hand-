-- Givezy: code review fixes, privacy and security (15/10/2026).

-- 1. A donor record can be shared by everyone who gives with one email address, so it no longer holds full
--    ID or income tax numbers (each donation's checkout details keep them, for its receipt). Clear the old copies.
update public.donors set id_number_encrypted = null, tax_reference_encrypted = null
 where id_number_encrypted is not null or tax_reference_encrypted is not null;

-- 2. The income log lives on the phone; this table is not written by the website or app. Closing it to
--    signed-in users means nothing in it can be a value someone pasted in to have it decrypted.
revoke insert, update, delete on public.maaser_income_entries from authenticated;

-- 3. A charity's status and approval fields change only on the server (submitting an application with its
--    four declarations, or a platform admin's decision), never directly from a browser.
revoke update on public.charities from authenticated;
grant update (name_en, name_he, legal_name_en, legal_name_he, description_en, description_he, funds_use_en, thank_you_en,
  website, logo_path, cover_path, npo_number, pbo_number, s18a_reference, address_line1, address_line2, suburb, city,
  postal_code, is_s18a, s18a_confirmed_at, mandate_signed_at, mandate_document_path, updated_at) on public.charities to authenticated;

-- 4. New functions are not callable by everyone unless granted. (The earlier per-schema statement could not
--    remove Postgres's global default; this one does, for functions created by this role from now on.)
alter default privileges revoke execute on functions from public;

-- 5. Erasure also clears the gateway's customer and subscription references on monthly donations.
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

  -- Free text the donor wrote, and any dedication (the name of someone they honoured or remembered).
  update public.donations set message = null, dedication_kind = null, dedication_name = null
   where donor_id = any (p_donor_ids) and (message is not null or dedication_name is not null);
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

-- 6. Givezy signs people in with an emailed code only. A session started with a password (for example
--    someone who registered another person's email with a password before that person ever signed in)
--    sees no donor records. The website refuses such sessions too (src/lib/auth.ts).
create or replace function public.signed_in_without_password() returns boolean
language sql stable set search_path = '' as $$
  select not coalesce((select auth.jwt()) -> 'amr' @> '[{"method": "password"}]'::jsonb, false)
$$;
grant execute on function public.signed_in_without_password() to authenticated;

create or replace function public.my_donor_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select d.id from public.donors d where d.user_id = (select auth.uid()) and public.signed_in_without_password()
$$;
revoke execute on function public.my_donor_ids() from public, anon;
grant execute on function public.my_donor_ids() to authenticated;
