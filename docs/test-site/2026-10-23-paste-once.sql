-- Givezy TEST project only (bodfyjskiwrwxhagtkxt), 23/10/2026. Paste all of this once and press Run.
-- It finishes what the connector couldn't (it times out on these): the rest of 20261022000005, 20261022000007,
-- 20261022000008, the no-emptying rule (20261022000002, last part), the erasure update (20261020000001, section 7)
-- and the removal of group challenges (20261016000016). All or nothing: if any line fails, nothing changes.
-- Safe to run twice.
begin;

-- 1. Only an approved charity may record gifts (20261022000005, second half; the function is already in).
drop trigger if exists donations_recorded_needs_approved on public.donations;
create trigger donations_recorded_needs_approved before insert on public.donations
  for each row when (new.gateway = 'recorded') execute function public.guard_recorded_gift_charity();

-- 2. A charity's own name change is always recorded (20261022000007).
create or replace function public.audit_charity_rename() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'approved' and new.name_en is distinct from old.name_en
     and (select auth.uid()) is not null and not public.is_platform_admin() then
    insert into public.audit_log (actor_user_id, action, entity_type, entity_id, details)
    values ((select auth.uid()), 'charity.public_name_changed', 'charity', new.id::text,
            jsonb_build_object('name_from', old.name_en, 'name_to', new.name_en));
  end if;
  return new;
end $$;
revoke execute on function public.audit_charity_rename() from public, anon, authenticated;
drop trigger if exists charities_audit_rename on public.charities;
create trigger charities_audit_rename after update of name_en on public.charities
  for each row execute function public.audit_charity_rename();

-- 3. A chosen cause can't be deleted; impact names can't start with a digit (20261022000008).
alter table public.charity_categories drop constraint if exists charity_categories_category_id_fkey;
alter table public.charity_categories add constraint charity_categories_category_id_fkey
  foreign key (category_id) references public.categories (id) on delete restrict;
alter table public.charities drop constraint if exists impact_unit_names_start_with_letter;
alter table public.charities add constraint impact_unit_names_start_with_letter
  check ((impact_unit_one is null or impact_unit_one !~ '^\s*[0-9]') and (impact_unit_many is null or impact_unit_many !~ '^\s*[0-9]'));

-- 4. Receipts, donations and the audit log can't be emptied (20261022000002, last part).
revoke truncate on public.audit_log, public.s18a_receipts, public.s18a_receipt_donations, public.donations, public.receipt_counters from service_role;
create or replace function public.refuse_truncate() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'This table cannot be emptied: its records are kept by law';
end $$;
drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate before truncate on public.audit_log for each statement execute function public.refuse_truncate();
drop trigger if exists s18a_receipts_no_truncate on public.s18a_receipts;
create trigger s18a_receipts_no_truncate before truncate on public.s18a_receipts for each statement execute function public.refuse_truncate();
drop trigger if exists s18a_receipt_donations_no_truncate on public.s18a_receipt_donations;
create trigger s18a_receipt_donations_no_truncate before truncate on public.s18a_receipt_donations for each statement execute function public.refuse_truncate();
drop trigger if exists donations_no_truncate on public.donations;
create trigger donations_no_truncate before truncate on public.donations for each statement execute function public.refuse_truncate();
drop trigger if exists receipt_counters_no_truncate on public.receipt_counters;
create trigger receipt_counters_no_truncate before truncate on public.receipt_counters for each statement execute function public.refuse_truncate();

-- 5. Erasure also clears a campaign answer (20261020000001, section 7).
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

-- 6. Group challenges removed (20261016000016). Never used; nothing was given to one.
drop function if exists public.charity_challenges(uuid);
drop function if exists public.challenge_public(text, uuid);
alter table public.donations drop constraint if exists donations_one_target;
alter table public.donations drop constraint if exists donations_challenge_same_charity;
drop index if exists public.donations_challenge;
alter table public.donations drop column if exists challenge_id;
drop table if exists public.group_challenges cascade;
drop function if exists public.limit_running_challenges();

commit;

-- Check: every column should say true.
select
  exists (select 1 from pg_trigger where tgname = 'donations_recorded_needs_approved') as approved_charities_only,
  exists (select 1 from pg_trigger where tgname = 'charities_audit_rename') as name_changes_recorded,
  (select confdeltype = 'r' from pg_constraint where conname = 'charity_categories_category_id_fkey') as causes_kept,
  exists (select 1 from pg_constraint where conname = 'impact_unit_names_start_with_letter') as impact_names_checked,
  (select count(*) = 5 from pg_trigger where tgname like '%\_no\_truncate') as records_cannot_be_emptied,
  (select pg_get_functiondef('public.erase_donor_data(uuid[])'::regprocedure) like '%campaign_answer%') as erasure_updated,
  not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'group_challenges') as challenges_removed;
