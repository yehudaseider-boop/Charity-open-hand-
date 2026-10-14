-- Privacy audit (08/10/2026): everyone's information stays in its own lane.
--
--   Donors       their own donations, receipts and maaser records only.
--   Charities    their own charity, and donors who actually gave to them,
--                without fees, contributions, gateway data, the donor's
--                maaser/chomesh choice or any part of ID and tax numbers.
--   The public   approved charities' public profile only.
--   NEDIV lev    platform admins, with the authenticator second step.
--   The server   payments, receipts and gateway records (service role).

-- ---------------------------------------------------------------------------
-- 1. Nobody but the server may TRUNCATE (which ignores row-level security),
--    add triggers or reference tables; also for tables created later.
-- ---------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p') loop
    execute format('revoke truncate, references, trigger on public.%I from anon, authenticated', t.relname);
  end loop;
end $$;
alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;

-- Server-only tables: no client may even try to read them.
revoke all on public.gateway_events, public.receipt_counters, public.rate_limit_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Charities: the public sees the public profile, never gateway account
--    references, the mandate file's location or a rejection reason. Those
--    are read by the server after it has checked who is asking.
-- ---------------------------------------------------------------------------
revoke select on public.charities from anon, authenticated;
grant select (
  id, slug, quickgive_code, name_en, name_he, legal_name_en, legal_name_he, description_en, description_he,
  website, logo_path, cover_path, npo_number, pbo_number, s18a_reference,
  address_line1, address_line2, suburb, city, postal_code, status, is_verified, verified_at,
  is_s18a, s18a_confirmed_at, mandate_signed_at, approved_at, created_at, updated_at
) on public.charities to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. What a donor typed at checkout (ID and tax numbers, encrypted, and their
--    fingerprints) is read by the server only. Donors see their donations;
--    charities see the charity view. Two people sharing an email can no
--    longer read each other's typed details.
-- ---------------------------------------------------------------------------
drop policy checkout_details_read on public.donation_checkout_details;
create policy checkout_details_platform_read on public.donation_checkout_details for select to authenticated
  using (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 4. Monthly donations: charities no longer read the raw rows (they hold the
--    gateway's subscription and customer references), the same as donations.
-- ---------------------------------------------------------------------------
drop policy recurring_read on public.recurring_donations;
create policy recurring_read on public.recurring_donations for select to authenticated
  using (donor_id in (select public.my_donor_ids()) or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 5. The charity view no longer carries any part of ID or tax numbers:
--    NEDIV lev issues the receipts, so charities don't need them.
-- ---------------------------------------------------------------------------
drop view public.charity_donations;
create view public.charity_donations with (security_barrier = true) as
  select
    d.id, d.charity_id, d.donor_id, d.status, d.amount_cents,
    d.paid_at, d.created_at, d.refunded_at, d.charged_back_at, d.tax_year,
    d.wants_18a, d.is_anonymous, d.message, d.campaign_id, d.recurring_id,
    c.donor_type, c.first_name, c.last_name, c.organisation_name, c.registration_number,
    c.contact_person, c.email, c.phone,
    c.address_line1, c.address_line2, c.suburb, c.city, c.postal_code
  from public.donations d
  left join public.donation_checkout_details c on c.donation_id = d.id
  where d.status in ('paid', 'refunded', 'charged_back')
    and (public.is_charity_admin(d.charity_id) or public.is_platform_admin());
revoke all on public.charity_donations from anon, authenticated;
grant select on public.charity_donations to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Leftovers: a helper from before the charity view existed, and trigger
--    functions that no client should call.
-- ---------------------------------------------------------------------------
drop function if exists public.donor_gave_to_my_charity(uuid);
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. A charity's document records may only point at files in that charity's
--    own folder, so removing a draft document can never touch another
--    charity's file.
-- ---------------------------------------------------------------------------
alter table public.charity_documents add constraint charity_documents_own_folder
  check (storage_path like charity_id::text || '/%' and storage_path not like '%..%');
