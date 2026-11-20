-- Givezy: partial refunds and open disputes on s18A receipts (code review, 20/11/2026).
--
-- A partial refund was only logged and the gift stayed 'paid', so the yearly s18A receipt run certified the
-- whole gift (a R1 000 gift refunded R400 was receipted for R1 000). A gift with an open dispute (chargeback
-- opened, not yet decided) was receipted too.
--
-- 1. donations.refunded_cents: how much of the gift itself (amount_cents, never Givezy's contribution or the
--    card charge) has been refunded. A receipt counts amount_cents - refunded_cents.
--    donations.receipt_hold: null when the gift may be receipted; otherwise a short reason ('dispute open',
--    'refund being reviewed') while a person must look. A held gift is left off every receipt.
--    Browsers can't write donations at all (insert, update and delete were revoked from authenticated in
--    20261006000002), which is what keeps these columns server-only. The column revoke below only documents it:
--    in Postgres a later table-wide grant would open these columns too, so never grant donations writes to
--    browsers (review 20/11/2026).
-- 2. donation_refunds: one row per partial refund recorded, keyed by where it came from (the payment
--    provider's event, or one admin entry), so the same refund delivered twice is counted once.
--    Server-only: no browser can read or write it.
-- 3. record_partial_refund(): the one way refunded_cents grows. Locks the gift, records the refund once per
--    source, never past the gift amount, only on a paid gift. Service role only.
-- 4. issue_s18a_receipt counts what is left of each gift, and refuses a held gift or one refunded in full.
--    Same function as 20261109000001_review_fixes_09_11.sql otherwise.

-- 1 -----------------------------------------------------------------------------------------------------------
alter table public.donations
  add column refunded_cents bigint not null default 0,
  add column receipt_hold text;
alter table public.donations
  add constraint donations_refunded_cents_range check (refunded_cents >= 0 and refunded_cents <= amount_cents),
  add constraint donations_receipt_hold_short check (receipt_hold is null or (length(btrim(receipt_hold)) between 1 and 200));
comment on column public.donations.refunded_cents is
  'Cents of the gift (amount_cents) refunded so far by partial refunds. An s18A receipt counts amount_cents - refunded_cents. Server-only writes (record_partial_refund).';
comment on column public.donations.receipt_hold is
  'Null when the gift may go on an s18A receipt; otherwise why a person must look first (''dispute open'', ''refund being reviewed''). Server-only writes.';
revoke insert (refunded_cents, receipt_hold), update (refunded_cents, receipt_hold) on public.donations from anon, authenticated;

-- 2 -----------------------------------------------------------------------------------------------------------
create table public.donation_refunds (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null references public.donations (id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  -- 'gateway_event:<gateway_events.id>' or 'admin:<one entry>': the same source is counted once.
  source text not null unique check (length(source) between 1 and 200),
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index donation_refunds_donation on public.donation_refunds (donation_id);
alter table public.donation_refunds enable row level security;
revoke all on public.donation_refunds from public, anon, authenticated;
grant select, insert on public.donation_refunds to service_role;

-- 3 -----------------------------------------------------------------------------------------------------------
-- Returns 'done' (recorded now), 'already' (this source was recorded before), 'not_found', 'not_paid' (only a
-- paid gift can be partly refunded) or 'too_much' (more than what is left of the gift; nothing recorded).
create or replace function public.record_partial_refund(
  p_donation_id uuid,
  p_amount_cents bigint,
  p_source text,
  p_actor uuid default null
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  d public.donations;
begin
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'A refund must be more than R0';
  end if;
  if p_source is null or length(p_source) not between 1 and 200 then
    raise exception 'A refund needs to say where it came from';
  end if;
  -- Hold the gift, so a receipt being issued at the same moment waits for the refund (or the refund for it).
  select * into d from public.donations where id = p_donation_id for update;
  if not found then return 'not_found'; end if;
  if exists (select 1 from public.donation_refunds where source = p_source) then return 'already'; end if;
  if d.status <> 'paid' then return 'not_paid'; end if;
  if d.refunded_cents + p_amount_cents > d.amount_cents then return 'too_much'; end if;
  insert into public.donation_refunds (donation_id, amount_cents, source, recorded_by)
  values (p_donation_id, p_amount_cents, p_source, p_actor);
  update public.donations set refunded_cents = refunded_cents + p_amount_cents where id = p_donation_id;
  return 'done';
end $$;
revoke execute on function public.record_partial_refund(uuid, bigint, text, uuid) from public, anon, authenticated;
grant execute on function public.record_partial_refund(uuid, bigint, text, uuid) to service_role;

-- 4 -----------------------------------------------------------------------------------------------------------
create or replace function public.issue_s18a_receipt(
  p_charity_id uuid,
  p_donor_id uuid,
  p_tax_year int,
  p_donation_ids uuid[],
  p_number_prefix text,
  p_details jsonb,
  p_donor_identity text default ''
) returns table (receipt_id uuid, receipt_number int, receipt_reference text, amount_cents bigint)
language plpgsql security definer set search_path = '' as $$
declare
  c public.charities;
  found_count int;
  good_count int;
  total bigint;
  n int;
  new_id uuid := gen_random_uuid();
  ref text;
begin
  if p_donation_ids is null or array_length(p_donation_ids, 1) is null then
    raise exception 'A receipt needs at least one donation';
  end if;
  if array_length(p_donation_ids, 1) <> (select count(distinct x) from unnest(p_donation_ids) x) then
    raise exception 'The same donation was listed twice';
  end if;

  select * into c from public.charities where id = p_charity_id for update;
  if not found then raise exception 'Charity not found'; end if;
  if not public.charity_can_issue_18a(c) then
    raise exception 'This charity cannot issue s18A receipts (approval or mandate missing)';
  end if;

  -- Hold the donations (in id order, so two receipts never wait on each other) until the receipt is in: a
  -- refund or charge-back can't change one between the checks below and the receipt.
  perform 1 from public.donations where id = any (p_donation_ids) order by id for update;

  select count(*) into found_count from public.donations where id = any (p_donation_ids);
  if found_count <> array_length(p_donation_ids, 1) then
    raise exception 'A listed donation does not exist';
  end if;

  -- What is left of each gift after partial refunds is what the receipt certifies.
  select count(*), coalesce(sum(d.amount_cents - d.refunded_cents), 0) into good_count, total
  from public.donations d
  where d.id = any (p_donation_ids)
    and d.status = 'paid'
    and d.charity_id = p_charity_id
    and d.donor_id = p_donor_id
    and d.tax_year = p_tax_year
    and d.wants_18a
    and c.mandate_signed_at <= d.paid_at
    -- not held for a person (an open dispute, a refund being reviewed), and not refunded in full
    and d.receipt_hold is null
    and d.amount_cents - d.refunded_cents > 0
    -- every donation was given under the same s18A identity (ID, tax or registration number)
    and coalesce((select x.receipt_identity from public.donation_checkout_details x where x.donation_id = d.id), '') = coalesce(p_donor_identity, '')
    and not exists (
      select 1 from public.s18a_receipt_donations l
      join public.s18a_receipts r on r.id = l.receipt_id
      where l.donation_id = d.id and r.status = 'issued'
    );
  if good_count <> array_length(p_donation_ids, 1) then
    raise exception 'A listed donation is not eligible for this receipt';
  end if;

  n := public.next_receipt_number(p_charity_id);
  ref := p_number_prefix || '-' || p_tax_year::text || '-' || lpad(n::text, greatest(4, length(n::text)), '0');

  insert into public.s18a_receipts (id, charity_id, receipt_number, donor_id, donor_identity, tax_year, amount_cents, details)
  values (new_id, p_charity_id, n, p_donor_id, coalesce(p_donor_identity, ''), p_tax_year, total,
          p_details || jsonb_build_object('receipt_reference', ref, 'amount_cents', total));
  insert into public.s18a_receipt_donations (receipt_id, donation_id)
  select new_id, x from unnest(p_donation_ids) x;

  return query select new_id, n, ref, total;
end $$;

revoke execute on function public.issue_s18a_receipt(uuid, uuid, int, uuid[], text, jsonb, text) from public, anon, authenticated;
grant execute on function public.issue_s18a_receipt(uuid, uuid, int, uuid[], text, jsonb, text) to service_role;
