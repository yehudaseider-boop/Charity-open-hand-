-- Givezy: a charity's address is locked once its application is submitted (26/10/2026, code check).
--
-- The address is printed on every s18A receipt. The website already refused address edits after submitting,
-- but the database still let a charity admin change it directly. Now the database refuses too; a platform admin
-- (or the server) can still correct it. The rest of the guard is unchanged.

create or replace function public.guard_charity_admin_fields() returns trigger
language plpgsql set search_path = '' as $$
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
  -- The address is printed on every s18A receipt. Once the application is submitted (and while it is approved
  -- or suspended) only a platform admin may change it, as the website already says.
  if old.status in ('pending_review', 'approved', 'suspended') and (
       new.address_line1 is distinct from old.address_line1
       or new.address_line2 is distinct from old.address_line2
       or new.suburb is distinct from old.suburb
       or new.city is distinct from old.city
       or new.postal_code is distinct from old.postal_code) then
    raise exception 'The address of a submitted or approved charity can only be changed by a platform admin';
  end if;
  -- A charity admin may only move draft/rejected -> pending_review (submit).
  if new.status is distinct from old.status
     and not (old.status in ('draft', 'rejected') and new.status = 'pending_review') then
    raise exception 'Only a platform admin can change charity status';
  end if;
  return new;
end $$;
