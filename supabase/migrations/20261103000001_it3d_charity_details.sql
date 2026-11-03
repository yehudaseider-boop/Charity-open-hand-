-- The charity's own SARS details for its IT3(d) submission (03/11/2026). Each charity submits its own IT3(d)
-- (Yehuda, 02/11/2026): it is both the submitting entity and the reporting entity in the file, so Givezy needs
-- three things it did not keep before. See docs/sars/it3d-decisions.md and docs/sars/it3d-spec.md.
--
-- - tax_reference_number: the charity's 10-digit income tax reference (BRS fields 216 and 312). SARS checks it
--   with Modulus 10 (Appendix I); the website checks that before saving. The first digit can only be
--   0, 1, 2, 3, 7 or 9 (field 312), which the database checks too.
-- - legal_form: the SARS "Nature of person" code (Appendix A) the charity is registered as. Only the five codes a
--   reporting entity may use (field 306 rules out the rest). The BRS does not say which one a non-profit company
--   uses, so the charity chooses it, with its accountant.
-- - registration_number: the CIPC company number (CCYY/NNNNNN/NN, Appendix K) or the Master's trust number. The
--   submitting entity's identification number (field 212) and, for a trust, field 309 (at most 15 characters).
--
-- Kept in charity_private with the contact and bank details: never public. The charity's admins can read them
-- (row-level security as before); only the server writes them, after checking the person is the owner.

alter table public.charity_private
  add column tax_reference_number text
    constraint charity_tax_reference_shape check (tax_reference_number is null or tax_reference_number ~ '^[012379][0-9]{9}$'),
  add column legal_form text
    constraint charity_legal_form_code check (legal_form is null or legal_form in
      ('OTHER_CO', 'INTERVIVOS_TRUST', 'ASSOC_NOT_FOR_GAIN', 'UNINCORPORATED_BODY_OF_PERSONS', 'GOVERNMENT_ENTITY')),
  add column registration_number text
    constraint charity_registration_number_shape check (registration_number is null or char_length(registration_number) between 1 and 30),
  add column sars_details_updated_at timestamptz;

-- Server-only writes for these columns: a browser session (even the charity's own admin) cannot change them.
-- The website saves them with the service role after checking the person is the charity's owner.
create or replace function public.guard_charity_sars_fields() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') or public.is_platform_admin() then
    return new;
  end if;
  if new.tax_reference_number is distinct from old.tax_reference_number
     or new.legal_form is distinct from old.legal_form
     or new.registration_number is distinct from old.registration_number
     or new.sars_details_updated_at is distinct from old.sars_details_updated_at then
    raise exception 'A charity''s SARS details can only be changed through the website';
  end if;
  return new;
end $$;
create trigger charity_private_sars_guard before update on public.charity_private
  for each row execute function public.guard_charity_sars_fields();
