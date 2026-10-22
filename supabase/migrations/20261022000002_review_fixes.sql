-- Fixes from the full review of 22/10/2026. Each part stands alone and can be run again.

-- 1. Recording a gift (typed or imported) must find the donor whatever the capitals in their email.
--    Inside this function the search path is empty, so a plain "=" on the citext column is the text
--    one: "Sarah@Gmail.com" online and "sarah@gmail.com" recorded did not match, the insert then hit the
--    unique donor rule, and the whole import failed. The citext operator is named in full instead.
create or replace function public.record_gifts(p_charity_id uuid, p_user_id uuid, p_import jsonb, p_gifts jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  g jsonb;
  v_import uuid;
  v_donor uuid;
  v_donation uuid;
  v_reg text;
  v_type public.donor_type;
  v_matches int;
  v_ids uuid[] := '{}';
begin
  if jsonb_typeof(p_gifts) <> 'array' or jsonb_array_length(p_gifts) = 0 then
    raise exception 'No gifts to record';
  end if;
  if p_import is not null then
    insert into public.gift_imports (charity_id, file_name, file_fingerprint, gifts, total_cents, created_by, confirmed_at)
    values (p_charity_id, p_import->>'file_name', p_import->>'file_fingerprint', jsonb_array_length(p_gifts),
            (select sum((x->>'amount_cents')::bigint) from jsonb_array_elements(p_gifts) x), p_user_id, (p_import->>'confirmed_at')::timestamptz)
    returning id into v_import;
  end if;

  for g in select * from jsonb_array_elements(p_gifts) loop
    v_type := (g->>'donor_type')::public.donor_type;
    v_reg := case when v_type = 'individual' then null else nullif(g->>'registration_number', '') end;
    -- The donor record for this email and type, shared with online gifts (the same rules as checkout).
    v_donor := null;
    if v_reg is not null then
      select id into v_donor from public.donors where email operator(public.=) (g->>'email')::public.citext and donor_type = v_type and registration_number = v_reg limit 1;
    elsif v_type = 'individual' then
      select id into v_donor from public.donors where email operator(public.=) (g->>'email')::public.citext and donor_type = v_type and registration_number is null limit 1;
    else
      select count(*) into v_matches from public.donors where email operator(public.=) (g->>'email')::public.citext and donor_type = v_type;
      if v_matches = 1 then
        select id into v_donor from public.donors where email operator(public.=) (g->>'email')::public.citext and donor_type = v_type;
      else
        select id into v_donor from public.donors where email operator(public.=) (g->>'email')::public.citext and donor_type = v_type and registration_number is null limit 1;
      end if;
    end if;
    if v_donor is null then
      -- Not the donor's own confirmation of age or consent: the charity recorded the gift.
      insert into public.donors (email, donor_type, registration_number, first_name, last_name, organisation_name, phone,
                                 id_number_last4, tax_reference_last4, address_line1, address_line2, suburb, city, postal_code)
      values (g->>'email', v_type, v_reg, g->>'first_name', g->>'last_name', g->>'organisation_name', g->>'phone',
              g->>'id_number_last4', g->>'tax_reference_last4', g->>'address_line1', g->>'address_line2', g->>'suburb', g->>'city', g->>'postal_code')
      returning id into v_donor;
    end if;

    insert into public.donations (donor_id, charity_id, campaign_id, amount_cents, contribution_cents, platform_fee_cents, fee_vat_cents,
                                  processing_charge_cents, total_charged_cents, status, paid_at, tax_year, gateway, gateway_ref, wants_18a,
                                  recorded_method, recorded_by, import_id, external_ref, came_from)
    values (v_donor, p_charity_id, nullif(g->>'campaign_id', '')::uuid, (g->>'amount_cents')::bigint, 0, 0, 0, 0, (g->>'amount_cents')::bigint,
            'paid', (g->>'paid_at')::timestamptz, (g->>'tax_year')::int, 'recorded', null, (g->>'wants_18a')::boolean,
            g->>'method', p_user_id, v_import, nullif(g->>'reference', ''), 'recorded')
    returning id into v_donation;

    insert into public.donation_checkout_details (donation_id, donor_type, email, first_name, last_name, organisation_name, registration_number, phone,
                                                  receipt_identity, id_number_encrypted, id_number_last4, tax_reference_encrypted, tax_reference_last4,
                                                  address_line1, address_line2, suburb, city, postal_code)
    values (v_donation, v_type, g->>'email', g->>'first_name', g->>'last_name', g->>'organisation_name', v_reg, g->>'phone',
            g->>'receipt_identity', g->>'id_number_encrypted', g->>'id_number_last4', g->>'tax_reference_encrypted', g->>'tax_reference_last4',
            g->>'address_line1', g->>'address_line2', g->>'suburb', g->>'city', g->>'postal_code');
    v_ids := v_ids || v_donation;
  end loop;
  return jsonb_build_object('import_id', v_import, 'donation_ids', to_jsonb(v_ids));
end $$;

-- 2. Issued s18A receipts, their links, donations and the audit trail are append-only for everyone,
--    the server included: TRUNCATE skipped the row-level guards, so it is refused as well.
revoke truncate on public.audit_log, public.s18a_receipts, public.s18a_receipt_donations, public.donations, public.receipt_counters from service_role;
create or replace function public.refuse_truncate() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'This table cannot be emptied: its records are kept by law';
end $$;
do $$
declare t text;
begin
  foreach t in array array['audit_log', 's18a_receipts', 's18a_receipt_donations', 'donations', 'receipt_counters'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_no_truncate', t);
    execute format('create trigger %I before truncate on public.%I for each statement execute function public.refuse_truncate()', t || '_no_truncate', t);
  end loop;
end $$;

-- 3. Cause of the week: visitors may read which charity is chosen for which week, not which Givezy
--    person chose it.
revoke select on public.featured_charities from anon, authenticated;
grant select (id, charity_id, week_start, created_at) on public.featured_charities to anon, authenticated;

-- 4. Only a charity's owner (or Givezy) may change its bank details, in the database too: before, any
--    admin of a draft charity could change them by calling the database directly.
create or replace function public.guard_charity_bank_fields() returns trigger
language plpgsql set search_path = '' as $$
declare
  st public.charity_status;
  bank_changed boolean;
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') or public.is_platform_admin() then
    return new;
  end if;
  select status into st from public.charities where id = new.charity_id;
  bank_changed := new.bank_name is distinct from old.bank_name
       or new.bank_account_holder is distinct from old.bank_account_holder
       or new.bank_account_number_encrypted is distinct from old.bank_account_number_encrypted
       or new.bank_account_last4 is distinct from old.bank_account_last4
       or new.bank_branch_code is distinct from old.bank_branch_code;
  if bank_changed and not exists (
    select 1 from public.charity_admins a
    where a.charity_id = new.charity_id and a.user_id = (select auth.uid()) and a.role = 'owner'
  ) then
    raise exception 'Bank details can only be changed by the charity''s owner';
  end if;
  if st in ('approved', 'suspended', 'pending_review') and (bank_changed or new.bank_verified_at is distinct from old.bank_verified_at) then
    raise exception 'Bank details can only be changed by a platform admin once an application is submitted';
  end if;
  if new.bank_verified_at is distinct from old.bank_verified_at then
    raise exception 'Only the platform can mark bank details verified';
  end if;
  if bank_changed then
    new.bank_verified_at := null;
  end if;
  return new;
end $$;
