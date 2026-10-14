-- Open Hand: charity onboarding (milestone 2)

-- Date the charity says it signed a document (used for the receipting mandate).
alter table public.charity_documents add column signed_on date;

-- Once a charity has been approved, its own admins may no longer change the
-- legal identifiers that appear on receipts. Corrections go through a
-- platform admin.
create or replace function public.guard_charity_admin_fields() returns trigger
language plpgsql as $$
begin
  -- Server-side code (service role) and migrations/seeds (postgres) are trusted.
  if current_user in ('service_role', 'postgres', 'supabase_admin') or public.is_platform_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'pending_review') or new.is_verified or new.is_s18a
       or new.mandate_signed_at is not null or new.gateway_subaccount_ref is not null then
      raise exception 'Only a platform admin can set approval, badge or gateway fields';
    end if;
    return new;
  end if;
  if new.is_verified is distinct from old.is_verified
     or new.verified_at is distinct from old.verified_at
     or new.is_s18a is distinct from old.is_s18a
     or new.s18a_confirmed_at is distinct from old.s18a_confirmed_at
     or new.mandate_signed_at is distinct from old.mandate_signed_at
     or new.mandate_document_path is distinct from old.mandate_document_path
     or new.gateway is distinct from old.gateway
     or new.gateway_subaccount_ref is distinct from old.gateway_subaccount_ref
     or new.approved_at is distinct from old.approved_at
     or new.rejection_reason is distinct from old.rejection_reason
     or new.slug is distinct from old.slug
     or new.quickgive_code is distinct from old.quickgive_code then
    raise exception 'Only a platform admin can change approval, badge or gateway fields';
  end if;
  if old.status in ('approved', 'suspended') and (
       new.legal_name_en is distinct from old.legal_name_en
       or new.legal_name_he is distinct from old.legal_name_he
       or new.npo_number is distinct from old.npo_number
       or new.pbo_number is distinct from old.pbo_number
       or new.s18a_reference is distinct from old.s18a_reference) then
    raise exception 'Legal details of an approved charity can only be changed by a platform admin';
  end if;
  -- A charity admin may only move draft/rejected -> pending_review (submit).
  if new.status is distinct from old.status
     and not (old.status in ('draft', 'rejected') and new.status = 'pending_review') then
    raise exception 'Only a platform admin can change charity status';
  end if;
  return new;
end $$;

-- Bank details decide where donations settle. After approval only a platform
-- admin may change them (and the change must be re-verified).
create or replace function public.guard_charity_bank_fields() returns trigger
language plpgsql as $$
declare st public.charity_status;
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') or public.is_platform_admin() then
    return new;
  end if;
  select status into st from public.charities where id = new.charity_id;
  if st in ('approved', 'suspended', 'pending_review') and (
       new.bank_name is distinct from old.bank_name
       or new.bank_account_holder is distinct from old.bank_account_holder
       or new.bank_account_number_encrypted is distinct from old.bank_account_number_encrypted
       or new.bank_account_last4 is distinct from old.bank_account_last4
       or new.bank_branch_code is distinct from old.bank_branch_code
       or new.bank_verified_at is distinct from old.bank_verified_at) then
    raise exception 'Bank details can only be changed by a platform admin once an application is submitted';
  end if;
  if new.bank_verified_at is distinct from old.bank_verified_at then
    raise exception 'Only the platform can mark bank details verified';
  end if;
  return new;
end $$;
create trigger charity_private_bank_guard before update on public.charity_private
  for each row execute function public.guard_charity_bank_fields();

-- Documents are locked once submitted (kept as the record of what was vetted).
create or replace function public.guard_charity_documents() returns trigger
language plpgsql as $$
declare st public.charity_status;
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') or public.is_platform_admin() then
    return coalesce(new, old);
  end if;
  select status into st from public.charities where id = coalesce(new.charity_id, old.charity_id);
  if tg_op in ('UPDATE', 'DELETE') and st not in ('draft', 'rejected') then
    raise exception 'Submitted documents cannot be changed or removed';
  end if;
  return coalesce(new, old);
end $$;
create trigger charity_documents_guard before insert or update or delete on public.charity_documents
  for each row execute function public.guard_charity_documents();

-- Directory search helpers
create index charities_status_name_idx on public.charities (status, name_en);

-- Storage: charity admins may upload and read their documents but not
-- overwrite or delete them (removal during draft goes through the server).
drop policy charity_documents_rw on storage.objects;
create policy charity_documents_read on storage.objects for select to authenticated
  using (bucket_id = 'charity-documents'
         and (public.is_platform_admin() or public.is_charity_admin(((storage.foldername(name))[1])::uuid)));
create policy charity_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'charity-documents'
         and (public.is_platform_admin() or public.is_charity_admin(((storage.foldername(name))[1])::uuid)));
create policy charity_documents_platform on storage.objects for all to authenticated
  using (bucket_id = 'charity-documents' and public.is_platform_admin())
  with check (bucket_id = 'charity-documents' and public.is_platform_admin());
