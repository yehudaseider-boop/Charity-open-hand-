-- Recorded gifts, after the code check of 21/10/2026:
-- 1. A whole import (or one typed gift) is saved by one database function, in one transaction: it is
--    really all or nothing, even if the website is stopped part way.
-- 2. The same file can't be imported twice for a charity, even from two tabs at once.
-- 3. A gift keeps its import: removing an import removes its gifts first (the guard refuses changing
--    import_id), so the link is "restrict", not "set null".

alter table public.gift_imports
  add column file_fingerprint text constraint gift_import_fingerprint check (file_fingerprint is null or file_fingerprint ~ '^[0-9a-f]{32}$');
create unique index gift_imports_once on public.gift_imports (charity_id, file_fingerprint) where file_fingerprint is not null;

alter table public.donations drop constraint donations_import_id_fkey;
alter table public.donations add constraint donations_import_id_fkey foreign key (import_id) references public.gift_imports (id) on delete restrict;

-- p_import: null for one typed gift, else {file_name, file_fingerprint, confirmed_at}.
-- p_gifts: the checked gifts, ID and tax numbers already encrypted by the website (the key never reaches
-- the database). Returns {import_id, donation_ids}.
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
      select id into v_donor from public.donors where email = g->>'email' and donor_type = v_type and registration_number = v_reg limit 1;
    elsif v_type = 'individual' then
      select id into v_donor from public.donors where email = g->>'email' and donor_type = v_type and registration_number is null limit 1;
    else
      select count(*) into v_matches from public.donors where email = g->>'email' and donor_type = v_type;
      if v_matches = 1 then
        select id into v_donor from public.donors where email = g->>'email' and donor_type = v_type;
      else
        select id into v_donor from public.donors where email = g->>'email' and donor_type = v_type and registration_number is null limit 1;
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
