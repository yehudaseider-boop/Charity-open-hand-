-- Full review (09/10/2026): database fixes.

-- ---------------------------------------------------------------------------
-- 1. Joining past donations to an account needs proof the person reads that
--    inbox: a sign-in by emailed code or link in this session. A password
--    sign-up for someone else's address must never claim their history.
-- ---------------------------------------------------------------------------
create or replace function public.link_my_donations() returns int
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  addr text;
  n int;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
    where a ->> 'method' in ('otp', 'magiclink', 'email/signup')
  ) then
    return 0;
  end if;
  select u.email into addr from auth.users u where u.id = uid and u.email_confirmed_at is not null;
  if addr is null then return 0; end if;
  update public.donors
     set user_id = uid,
         email_verified_at = coalesce(email_verified_at, now())
   where lower(email::text) = lower(addr)
     and user_id is null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.link_my_donations() from public, anon;
grant execute on function public.link_my_donations() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. A private note can only be written on the person's own donation, and
--    one person's note can't block another's.
-- ---------------------------------------------------------------------------
alter table public.donation_private_notes drop constraint donation_private_notes_pkey;
alter table public.donation_private_notes add primary key (donation_id, user_id);
drop policy private_notes_own on public.donation_private_notes;
create policy private_notes_own on public.donation_private_notes for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and donation_id in (select d.id from public.donations d where d.donor_id in (select public.my_donor_ids())));

-- ---------------------------------------------------------------------------
-- 3. Functions are not callable by everyone by default: only where granted.
-- ---------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           join pg_roles r on r.oid = p.proowner
           where n.nspname = 'public' and r.rolname = 'postgres' loop
    execute format('revoke execute on function %s from public', f.sig);
  end loop;
end $$;
alter default privileges in schema public revoke execute on functions from public;
-- Used inside row-level security policies, so the signed-in roles need them.
grant execute on function public.has_second_step(), public.is_platform_admin(), public.is_charity_admin(uuid) to anon, authenticated;
grant execute on function public.charity_can_issue_18a(public.charities) to anon, authenticated;
grant execute on function public.my_donor_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Issued receipts: every field is fixed, including who they are for.
--    Voiding sets the void fields once; nothing else ever changes.
-- ---------------------------------------------------------------------------
create or replace function public.guard_receipt_immutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 's18A receipts are never deleted; void them instead';
  end if;
  if old.status = 'void' then
    raise exception 'A void receipt cannot be changed';
  end if;
  if (new.charity_id, new.receipt_number, new.donor_id, new.donor_identity, new.tax_year, new.amount_cents, new.details, new.issued_at)
     is distinct from
     (old.charity_id, old.receipt_number, old.donor_id, old.donor_identity, old.tax_year, old.amount_cents, old.details, old.issued_at)
     or (old.pdf_path is not null and new.pdf_path is distinct from old.pdf_path)
     or (new.status = 'issued' and (new.voided_at, new.void_reason, new.replaced_by_id) is distinct from (old.voided_at, old.void_reason, old.replaced_by_id)) then
    raise exception 'Issued receipts are immutable; void and reissue instead';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Once a donation is processed, what decides its receipt is fixed too.
-- ---------------------------------------------------------------------------
create or replace function public.guard_donation_status() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status and not (
       (old.status = 'pending' and new.status in ('paid', 'failed'))
       or (old.status = 'failed' and new.status = 'paid')
       or (old.status = 'paid' and new.status in ('refunded', 'charged_back'))
     ) then
    raise exception 'Donation cannot move from % to %', old.status, new.status;
  end if;
  if old.status <> 'pending' and (
       new.amount_cents, new.platform_fee_cents, new.fee_vat_cents, new.processing_charge_cents,
       new.contribution_cents, new.total_charged_cents, new.charity_id, new.donor_id)
     is distinct from (
       old.amount_cents, old.platform_fee_cents, old.fee_vat_cents, old.processing_charge_cents,
       old.contribution_cents, old.total_charged_cents, old.charity_id, old.donor_id) then
    raise exception 'Amounts of a processed donation cannot change';
  end if;
  if old.status in ('paid', 'refunded', 'charged_back') and (
       new.paid_at, new.tax_year, new.wants_18a) is distinct from (old.paid_at, old.tax_year, old.wants_18a) then
    raise exception 'The date, tax year and receipt choice of a paid donation cannot change';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Narrower table rights (row-level security already blocked these).
-- ---------------------------------------------------------------------------
revoke insert, delete on public.profiles from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Charity documents: none added after submission, and the uploader is
--    whoever is signed in.
-- ---------------------------------------------------------------------------
create or replace function public.guard_charity_documents() returns trigger
language plpgsql as $$
declare st public.charity_status;
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') or public.is_platform_admin() then
    return coalesce(new, old);
  end if;
  select status into st from public.charities where id = coalesce(new.charity_id, old.charity_id);
  if st not in ('draft', 'rejected') then
    raise exception 'Documents cannot be added, changed or removed once the application is submitted';
  end if;
  if tg_op = 'INSERT' and new.uploaded_by is distinct from (select auth.uid()) then
    raise exception 'Documents are recorded as uploaded by the person signed in';
  end if;
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------------
-- 8. A charity's created date is a record, not something it edits.
-- ---------------------------------------------------------------------------
revoke update on public.charities from authenticated;
grant update (name_en, name_he, legal_name_en, legal_name_he, description_en, description_he, funds_use_en, thank_you_en,
  website, logo_path, cover_path, npo_number, pbo_number, s18a_reference, address_line1, address_line2, suburb, city,
  postal_code, status, rejection_reason, is_verified, verified_at, is_s18a, s18a_confirmed_at, mandate_signed_at,
  mandate_document_path, approved_at, updated_at) on public.charities to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Indexes for the columns row-level security and receipts look up.
-- ---------------------------------------------------------------------------
create index if not exists s18a_receipts_donor on public.s18a_receipts (donor_id);
create index if not exists recurring_donations_donor on public.recurring_donations (donor_id);
create index if not exists s18a_receipt_donations_donation on public.s18a_receipt_donations (donation_id);
create index if not exists donation_private_notes_user on public.donation_private_notes (user_id);
create index if not exists maaser_income_entries_user on public.maaser_income_entries (user_id);
create index if not exists external_giving_entries_user on public.external_giving_entries (user_id);
create index if not exists data_requests_user on public.data_requests (user_id);
create index if not exists charity_documents_charity on public.charity_documents (charity_id);
