-- Givezy: code review fixes, privacy (15/10/2026, decided by Yehuda).
-- Charities no longer see any part of a donor's ID or income tax number. Until now a charity admin
-- could read a receipt's full stored details (including the last 4 digits of ID and tax numbers, and
-- the identity fingerprint) and download the PDF, which prints them. Yosef is to confirm what a
-- charity must hold; until then charities see their receipts through two narrow views only.

-- 1. Receipts: the donor (their own), platform admins. Not charity admins.
drop policy receipts_read on public.s18a_receipts;
create policy receipts_read on public.s18a_receipts for select to authenticated
  using (donor_id in (select public.my_donor_ids()) or public.is_platform_admin());
-- (receipt_links_read follows: a link is readable only when its receipt is.)

-- 2. A charity's receipts: reference, donor name, amount and status. No ID or tax digits, no fingerprint.
create view public.charity_receipts with (security_barrier = true) as
  select
    r.id, r.charity_id, r.tax_year, r.amount_cents, r.issued_at, r.status, r.emailed_at,
    r.details->>'receipt_reference' as reference,
    r.details->'donor'->>'name' as donor_name
  from public.s18a_receipts r
  where public.is_charity_admin(r.charity_id) or public.is_platform_admin();
revoke all on public.charity_receipts from anon, authenticated;
grant select on public.charity_receipts to authenticated;

-- 3. Which receipt a charity's donation is on.
create view public.charity_receipt_donations with (security_barrier = true) as
  select rd.donation_id, r.id as receipt_id, r.charity_id, r.status, r.details->>'receipt_reference' as reference
  from public.s18a_receipt_donations rd
  join public.s18a_receipts r on r.id = rd.receipt_id
  where public.is_charity_admin(r.charity_id) or public.is_platform_admin();
revoke all on public.charity_receipt_donations from anon, authenticated;
grant select on public.charity_receipt_donations to authenticated;
