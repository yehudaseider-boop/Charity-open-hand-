-- Givezy: recorded gifts and a charity's bank details, held by the database too (code review, 23/11/2026).
--
-- 1. The same recorded gift twice. The website looks for a gift already recorded (the same donor email, amount and
--    date, when there is no reference) before it calls record_gifts, but nothing held two saves apart: a quick
--    double press of "Record gift", or two people on the team at once, could both pass the look and both save. The
--    only database guard was the reference index (donations_recorded_ref), and only when a reference is given.
--    record_gifts now holds the charity (a transaction lock, one per charity) and looks again itself, among that
--    charity's recorded gifts without a reference: the same email, amount and Johannesburg date is refused with
--    'recorded_gift_twice', and nothing in that call is saved. The website shows its usual message for it
--    (src/lib/charity/recorded-gifts-store.ts). A gift with a reference is still told apart by its reference.
--    record_gifts stays the server's only (service role).
--
-- 2. A charity's bank details straight through the database API. charity_private had a table-wide UPDATE right for
--    signed-in people (row policy charity_private_update), so a draft charity's owner could write the bank columns
--    directly, past the website's encryption, audit log, bank check and "Undo". The website now saves the bank
--    account with the service role, after its own checks (src/app/charity-admin/[id]/application/actions.ts,
--    saveBank). A browser session may now only update the columns the website still writes with the person's own
--    session: the contact person, email and phone (saveContact, owner only by trigger) and the donation emails switch
--    (saveDonationEmails). The bank columns, bank_verified_at and the SARS details are the server's alone.
--    ANY COLUMN ADDED TO charity_private LATER THAT A BROWSER MUST WRITE NEEDS ITS OWN
--    "grant update (column) on public.charity_private to authenticated".
--    Insert and delete were already closed to browsers (20261009000001_security_hardening.sql). The bank and SARS
--    guard triggers stay, as a second line.

-- 1 --------------------------------------------------------------------------------------------------------------
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
  -- One save at a time per charity, until this one commits: a second save then sees what this one recorded.
  perform pg_advisory_xact_lock(hashtext('record_gifts:' || p_charity_id::text));
  if p_import is not null then
    insert into public.gift_imports (charity_id, file_name, file_fingerprint, gifts, total_cents, created_by, confirmed_at)
    values (p_charity_id, p_import->>'file_name', p_import->>'file_fingerprint', jsonb_array_length(p_gifts),
            (select sum((x->>'amount_cents')::bigint) from jsonb_array_elements(p_gifts) x), p_user_id, (p_import->>'confirmed_at')::timestamptz)
    returning id into v_import;
  end if;

  for g in select * from jsonb_array_elements(p_gifts) loop
    -- The same gift already recorded (the website's own look, see giftKey in src/lib/charity/recorded-gifts.ts):
    -- without a reference, the same donor email, amount and date. Refused, so nothing in this call is saved.
    if nullif(g->>'reference', '') is null and exists (
      select 1
      from public.donations d
      join public.donation_checkout_details x on x.donation_id = d.id
      where d.charity_id = p_charity_id
        and d.gateway = 'recorded'
        and d.external_ref is null
        and d.amount_cents = (g->>'amount_cents')::bigint
        and (d.paid_at at time zone 'Africa/Johannesburg')::date = ((g->>'paid_at')::timestamptz at time zone 'Africa/Johannesburg')::date
        and x.email operator(public.=) (g->>'email')::public.citext
    ) then
      raise exception 'recorded_gift_twice: this gift is already recorded (the same email, amount and date)';
    end if;

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
revoke execute on function public.record_gifts(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.record_gifts(uuid, uuid, jsonb, jsonb) to service_role;

-- 2 --------------------------------------------------------------------------------------------------------------
-- Revoking the table-wide right also removes any column rights; the grant below gives back only these columns.
revoke update on public.charity_private from anon, authenticated;
grant update (contact_name, contact_email, contact_phone, notify_donations) on public.charity_private to authenticated;
