-- Security hardening from the security audit (06/11/2026).
--
-- The audit found no way for one charity to reach another charity's data, and no way for anyone to read
-- someone else's private details, in the database or the website. Three things are tightened anyway:
--
-- 1. Storage: a charity admin could store an object under a name such as 'A/../B/pwn.png'. The policies
--    check only the first folder ('A', their own charity), but a storage backend that tidies the path would
--    put the file in charity B's folder. Object names with '..', a backslash or a leading slash are now
--    refused. Each policy is recreated with the same name, roles and checks, plus that rule.
-- 2. Ciphertext and payment provider references are no longer readable by a browser session, not even by
--    the person or charity they belong to. Only the server (service role) reads them, and decrypts on the
--    server where needed. Hidden from `authenticated`:
--      charity_private.bank_account_number_encrypted (any charity admin with the second step could read it)
--      donors.id_number_encrypted, donors.tax_reference_encrypted (a donor could read their own)
--      donation_checkout_details.id_number_encrypted, .tax_reference_encrypted (platform admins could read them)
--      recurring_donations.gateway_subscription_ref, .gateway_customer_ref (a donor could read their own)
--    These tables now use column grants for reading. ANY COLUMN ADDED TO charity_private, donors,
--    donation_checkout_details OR recurring_donations LATER MUST BE GRANTED EXPLICITLY
--    (grant select (new_column) on public.X to authenticated), or browsers cannot read it.
--    Nothing on the website or in the app reads these columns with a browser session (checked 06/11/2026).
--    donations.gateway_ref stays readable: the donation return page looks a gift up by it for the signed-in
--    donor, and it is only the provider's id for that one payment.
-- 3. public.ciphertext_hidden_from_browsers(): true once this migration is in. The admin settings check
--    calls it (service role only).
--
-- Left alone on purpose, as tidy items on the go-live checklist: the citext extension in the public schema,
-- and the donation_giving_kinds check constraint that still lists older kind names.

-- 1 ---------------------------------------------------------------------------------------------------------
-- From 20261006000002_row_level_security.sql.
drop policy if exists charity_public_write on storage.objects;
create policy charity_public_write on storage.objects for all to authenticated
  using (bucket_id = 'charity-public'
         and name !~ '\.\.' and name !~ '^/' and strpos(name, chr(92)) = 0
         and (public.is_platform_admin() or public.is_charity_admin(((storage.foldername(name))[1])::uuid)))
  with check (bucket_id = 'charity-public'
         and name !~ '\.\.' and name !~ '^/' and strpos(name, chr(92)) = 0
         and (public.is_platform_admin() or public.is_charity_admin(((storage.foldername(name))[1])::uuid)));

-- From 20261007000001_charity_onboarding.sql. charity_documents_platform (platform admins only) is unchanged.
drop policy if exists charity_documents_read on storage.objects;
create policy charity_documents_read on storage.objects for select to authenticated
  using (bucket_id = 'charity-documents'
         and name !~ '\.\.' and name !~ '^/' and strpos(name, chr(92)) = 0
         and (public.is_platform_admin() or public.is_charity_admin(((storage.foldername(name))[1])::uuid)));
drop policy if exists charity_documents_insert on storage.objects;
create policy charity_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'charity-documents'
         and name !~ '\.\.' and name !~ '^/' and strpos(name, chr(92)) = 0
         and (public.is_platform_admin() or public.is_charity_admin(((storage.foldername(name))[1])::uuid)));

-- 2 ---------------------------------------------------------------------------------------------------------
-- Every column except the ciphertext, as of 20261103000001_it3d_charity_details.sql.
revoke select on public.charity_private from authenticated;
grant select (
  charity_id, contact_name, contact_email, contact_phone, bank_name, bank_account_holder, bank_account_last4,
  bank_branch_code, bank_verified_at, updated_at, notify_donations,
  tax_reference_number, legal_form, registration_number, sars_details_updated_at
) on public.charity_private to authenticated;

revoke select on public.donors from authenticated;
grant select (
  id, user_id, email, email_verified_at, donor_type, first_name, last_name, phone,
  organisation_name, registration_number, contact_person, id_number_last4, tax_reference_last4,
  address_line1, address_line2, suburb, city, postal_code,
  age_confirmed_18_at, date_of_birth, popia_consent_at, referred_by_charity_id, created_at, updated_at, erased_at
) on public.donors to authenticated;

revoke select on public.donation_checkout_details from authenticated;
grant select (
  donation_id, donor_type, email, first_name, last_name, organisation_name, registration_number, contact_person,
  phone, id_number_last4, tax_reference_last4, address_line1, address_line2, suburb, city, postal_code,
  created_at, receipt_identity, erased_at
) on public.donation_checkout_details to authenticated;

-- Already on column grants since 20261013000001_monthly_giving.sql: take the two provider references away.
revoke select (gateway_subscription_ref, gateway_customer_ref) on public.recurring_donations from authenticated;

-- 3 ---------------------------------------------------------------------------------------------------------
create or replace function public.ciphertext_hidden_from_browsers() returns boolean
language sql stable set search_path = '' as $$
  select not (
    has_column_privilege('authenticated', 'public.charity_private', 'bank_account_number_encrypted', 'select')
    or has_column_privilege('authenticated', 'public.donors', 'id_number_encrypted', 'select')
    or has_column_privilege('authenticated', 'public.donors', 'tax_reference_encrypted', 'select')
    or has_column_privilege('authenticated', 'public.donation_checkout_details', 'id_number_encrypted', 'select')
    or has_column_privilege('authenticated', 'public.donation_checkout_details', 'tax_reference_encrypted', 'select')
    or has_column_privilege('authenticated', 'public.recurring_donations', 'gateway_subscription_ref', 'select')
    or has_column_privilege('authenticated', 'public.recurring_donations', 'gateway_customer_ref', 'select')
  )
$$;
revoke all on function public.ciphertext_hidden_from_browsers() from public, anon, authenticated;
grant execute on function public.ciphertext_hidden_from_browsers() to service_role;
