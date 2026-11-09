-- Givezy: code review fixes, database (09/11/2026).
--
-- 1. Erasure keeps what SARS needs for gifts on an issued s18A receipt. erase_donor_data cleared the ID and
--    tax numbers, registration number, names and address on every checkout record, also those behind an
--    issued receipt, so the charity's IT3(d) file could never report that receipt again. Tax law requires the
--    charity to report and keep them (POPIA s14 allows keeping what a law requires). On gifts linked to an
--    ISSUED s18A receipt those fields now stay; everything else (email, phone, contact person, last four
--    digits, the identity fingerprint) still goes, and erased_at is still set so every screen knows.
--    Gifts with no issued receipt are erased in full, as before. Same function as
--    20261020000001_review_fixes.sql otherwise.
-- 2. issue_s18a_receipt locks the listed donations (in id order) before it checks them, so a refund running at
--    the same moment can't slip between the "still paid" check and the receipt. Same function as
--    20261015000005_receipt_numbers_past_9999.sql otherwise.
-- 3. ciphertext_hidden_from_browsers() also checks the monthly card authorisation and the saved cards table,
--    and checks anon as well as authenticated.
-- 4. fee_settings.gateway_fixed_cents is bigint (already done in 20261020000001; made certain here).
-- 5. Storage: a charity's public files may only sit where the website puts them (logo and cover in the
--    charity's own folder, photos/ and updates/ under it), and documents may only be added while the
--    application is in draft or sent back (the same rule as guard_charity_documents and the application page).
-- 6. audit_charity_rename also records a suspended charity renaming itself.
-- 7. my_news_opt_outs(): the charities the signed-in person said "no news" to, for the app's news feed, under
--    any email address they have used with us (sign-in, donor record, or typed at a checkout).
-- 8. A monthly donation carries an SA ID number added later to every new gift, also when the first gift (which
--    new gifts copy their details from) is already on an issued s18A receipt and so can't be changed. Browsers
--    may read only the last four digits.

-- 8 (columns first, the erase function below clears them) -----------------------------------------------------
alter table public.recurring_donations
  add column if not exists id_number_carry_encrypted text,
  add column if not exists id_number_carry_last4 text,
  add column if not exists receipt_identity_carry text;
grant select (id_number_carry_last4) on public.recurring_donations to authenticated;

-- 1 ---------------------------------------------------------------------------------------------------------
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

  -- Their address in the rate limiter's short-lived records.
  delete from public.rate_limit_events where key = any (select 'email:' || e from unnest(emails) e);

  return jsonb_build_object('donors', n_donors, 'checkout_details', n_details, 'monthly_stopped', n_monthly,
                            'giving_choices', n_kinds, 'messages', n_messages, 'gateway_records', n_events);
end $$;
revoke execute on function public.erase_donor_data(uuid[]) from public, anon, authenticated;
grant execute on function public.erase_donor_data(uuid[]) to service_role;

-- 2 ---------------------------------------------------------------------------------------------------------
create or replace function public.issue_s18a_receipt(
  p_charity_id uuid,
  p_donor_id uuid,
  p_tax_year int,
  p_donation_ids uuid[],
  p_number_prefix text,
  p_details jsonb,
  p_donor_identity text default ''
) returns table (receipt_id uuid, receipt_number int, receipt_reference text, amount_cents bigint)
language plpgsql security definer set search_path = '' as $$
declare
  c public.charities;
  found_count int;
  good_count int;
  total bigint;
  n int;
  new_id uuid := gen_random_uuid();
  ref text;
begin
  if p_donation_ids is null or array_length(p_donation_ids, 1) is null then
    raise exception 'A receipt needs at least one donation';
  end if;
  if array_length(p_donation_ids, 1) <> (select count(distinct x) from unnest(p_donation_ids) x) then
    raise exception 'The same donation was listed twice';
  end if;

  select * into c from public.charities where id = p_charity_id for update;
  if not found then raise exception 'Charity not found'; end if;
  if not public.charity_can_issue_18a(c) then
    raise exception 'This charity cannot issue s18A receipts (approval or mandate missing)';
  end if;

  -- Hold the donations (in id order, so two receipts never wait on each other) until the receipt is in: a
  -- refund or charge-back can't change one between the checks below and the receipt.
  perform 1 from public.donations where id = any (p_donation_ids) order by id for update;

  select count(*) into found_count from public.donations where id = any (p_donation_ids);
  if found_count <> array_length(p_donation_ids, 1) then
    raise exception 'A listed donation does not exist';
  end if;

  select count(*), coalesce(sum(d.amount_cents), 0) into good_count, total
  from public.donations d
  where d.id = any (p_donation_ids)
    and d.status = 'paid'
    and d.charity_id = p_charity_id
    and d.donor_id = p_donor_id
    and d.tax_year = p_tax_year
    and d.wants_18a
    and c.mandate_signed_at <= d.paid_at
    -- every donation was given under the same s18A identity (ID, tax or registration number)
    and coalesce((select x.receipt_identity from public.donation_checkout_details x where x.donation_id = d.id), '') = coalesce(p_donor_identity, '')
    and not exists (
      select 1 from public.s18a_receipt_donations l
      join public.s18a_receipts r on r.id = l.receipt_id
      where l.donation_id = d.id and r.status = 'issued'
    );
  if good_count <> array_length(p_donation_ids, 1) then
    raise exception 'A listed donation is not eligible for this receipt';
  end if;

  n := public.next_receipt_number(p_charity_id);
  ref := p_number_prefix || '-' || p_tax_year::text || '-' || lpad(n::text, greatest(4, length(n::text)), '0');

  insert into public.s18a_receipts (id, charity_id, receipt_number, donor_id, donor_identity, tax_year, amount_cents, details)
  values (new_id, p_charity_id, n, p_donor_id, coalesce(p_donor_identity, ''), p_tax_year, total,
          p_details || jsonb_build_object('receipt_reference', ref, 'amount_cents', total));
  insert into public.s18a_receipt_donations (receipt_id, donation_id)
  select new_id, x from unnest(p_donation_ids) x;

  return query select new_id, n, ref, total;
end $$;

revoke execute on function public.issue_s18a_receipt(uuid, uuid, int, uuid[], text, jsonb, text) from public, anon, authenticated;
grant execute on function public.issue_s18a_receipt(uuid, uuid, int, uuid[], text, jsonb, text) to service_role;

-- 3 ---------------------------------------------------------------------------------------------------------
create or replace function public.ciphertext_hidden_from_browsers() returns boolean
language sql stable set search_path = '' as $$
  select not exists (
    select 1 from unnest(array['authenticated', 'anon']::name[]) as r(role_name)
    where has_column_privilege(r.role_name, 'public.charity_private', 'bank_account_number_encrypted', 'select')
       or has_column_privilege(r.role_name, 'public.donors', 'id_number_encrypted', 'select')
       or has_column_privilege(r.role_name, 'public.donors', 'tax_reference_encrypted', 'select')
       or has_column_privilege(r.role_name, 'public.donation_checkout_details', 'id_number_encrypted', 'select')
       or has_column_privilege(r.role_name, 'public.donation_checkout_details', 'tax_reference_encrypted', 'select')
       or has_column_privilege(r.role_name, 'public.recurring_donations', 'gateway_subscription_ref', 'select')
       or has_column_privilege(r.role_name, 'public.recurring_donations', 'gateway_customer_ref', 'select')
       or has_column_privilege(r.role_name, 'public.recurring_donations', 'authorization_encrypted', 'select')
       or has_column_privilege(r.role_name, 'public.recurring_donations', 'id_number_carry_encrypted', 'select')
       or has_column_privilege(r.role_name, 'public.recurring_donations', 'receipt_identity_carry', 'select')
       or has_any_column_privilege(r.role_name, 'public.saved_cards', 'select')
  )
$$;
revoke all on function public.ciphertext_hidden_from_browsers() from public, anon, authenticated;
grant execute on function public.ciphertext_hidden_from_browsers() to service_role;

-- 4 ---------------------------------------------------------------------------------------------------------
do $$
begin
  if (select data_type from information_schema.columns
       where table_schema = 'public' and table_name = 'fee_settings' and column_name = 'gateway_fixed_cents') <> 'bigint' then
    alter table public.fee_settings alter column gateway_fixed_cents type bigint;
  end if;
end $$;

-- 5 ---------------------------------------------------------------------------------------------------------
-- The website's paths (src/app/charity-admin/[id]/profile/actions.ts and updates/actions.ts):
--   <charity id>/logo-<uuid>.<ext>, <charity id>/cover-<uuid>.<ext>, <charity id>/photos/<uuid>.<ext>, <charity id>/updates/<uuid>.<ext>
drop policy if exists charity_public_write on storage.objects;
create policy charity_public_write on storage.objects for all to authenticated
  using (bucket_id = 'charity-public'
         and name !~ '\.\.' and name !~ '^/' and strpos(name, chr(92)) = 0
         and (name ~ '^[^/]+/(logo|cover)[^/]*$' or name ~ '^[^/]+/(photos|updates)/[^/]+$')
         and (public.is_platform_admin() or public.is_charity_admin(((storage.foldername(name))[1])::uuid)))
  with check (bucket_id = 'charity-public'
         and name !~ '\.\.' and name !~ '^/' and strpos(name, chr(92)) = 0
         and (name ~ '^[^/]+/(logo|cover)[^/]*$' or name ~ '^[^/]+/(photos|updates)/[^/]+$')
         and (public.is_platform_admin() or public.is_charity_admin(((storage.foldername(name))[1])::uuid)));

-- Whether a charity's application is still open for documents: draft or sent back (rejected), as
-- guard_charity_documents and the application page say. Read as the definer: the storage policy runs as the
-- signed-in person, who may not read every column of the charity row.
create or replace function public.charity_application_open(p_charity_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.charities where id = p_charity_id and status in ('draft', 'rejected'))
     and (public.is_platform_admin() or public.is_charity_admin(p_charity_id))
$$;
revoke all on function public.charity_application_open(uuid) from public, anon;
grant execute on function public.charity_application_open(uuid) to authenticated, service_role;

drop policy if exists charity_documents_insert on storage.objects;
create policy charity_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'charity-documents'
         and name !~ '\.\.' and name !~ '^/' and strpos(name, chr(92)) = 0
         and (public.is_platform_admin()
              or (public.is_charity_admin(((storage.foldername(name))[1])::uuid)
                  and public.charity_application_open(((storage.foldername(name))[1])::uuid))));

-- 6 ---------------------------------------------------------------------------------------------------------
create or replace function public.audit_charity_rename() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status in ('approved', 'suspended') and new.name_en is distinct from old.name_en
     and (select auth.uid()) is not null and not public.is_platform_admin() then
    insert into public.audit_log (actor_user_id, action, entity_type, entity_id, details)
    values ((select auth.uid()), 'charity.public_name_changed', 'charity', new.id::text,
            jsonb_build_object('name_from', old.name_en, 'name_to', new.name_en));
  end if;
  return new;
end $$;
revoke execute on function public.audit_charity_rename() from public, anon, authenticated;

-- 7 ---------------------------------------------------------------------------------------------------------
-- The charities whose news and appeals the signed-in person turned off, under any address they have used with us:
-- their sign-in address, the address on their donor records, and every address typed at their checkouts. Opt-outs
-- keep only a hash of the address: sha256 of the address trimmed and in lower case, as emailHash() in
-- src/lib/charity/thank-you.ts (used by optOutAtCheckout and the stop link). Password sessions get nothing, like
-- my_donor_ids().
create or replace function public.my_news_opt_outs() returns setof uuid
language sql stable security definer set search_path = '' as $$
  with mine as (
    select lower(btrim(u.email::text)) as e from auth.users u where u.id = (select auth.uid()) and u.email is not null
    union
    select lower(btrim(d.email::text)) from public.donors d
     where d.id in (select public.my_donor_ids()) and d.email is not null and d.erased_at is null
    union
    select lower(btrim(c.email::text)) from public.donation_checkout_details c
      join public.donations g on g.id = c.donation_id
     where g.donor_id in (select public.my_donor_ids()) and c.email is not null and c.erased_at is null
  )
  select distinct o.charity_id
    from public.charity_email_opt_outs o
   where public.signed_in_without_password()
     and o.email_hash in (select encode(sha256(convert_to(m.e, 'UTF8')), 'hex') from mine m)
$$;
revoke all on function public.my_news_opt_outs() from public, anon;
grant execute on function public.my_news_opt_outs() to authenticated;
