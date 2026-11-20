-- Givezy: receipts and part refunds that happen at the same moment (code review, 20/11/2026).
--
-- 1. issue_s18a_receipt refuses when the printed gift lines don't add up to the total it certifies. The lines are
--    read before the gifts are held; a part refund recorded in between left the PDF showing the full gift while the
--    stored total was right. The run tries that receipt again next time, with fresh amounts.
-- 2. The receipt's issued_at and the refund's created_at are both taken while the gift is held (clock_timestamp),
--    not at the start of each transaction. The step that withdraws receipts after a part refund compares the two;
--    with transaction start times a receipt that certified the full gift could look "issued after the refund" and
--    be kept, and a correct one could be withdrawn.
-- Same functions as 20261120000001_partial_refunds.sql otherwise.

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
  -- The time is taken now, while the gift is held (never the transaction's start): a receipt issued before this
  -- refund always has an earlier time, and one issued after it a later one (review 20/11/2026).
  insert into public.donation_refunds (donation_id, amount_cents, source, recorded_by, created_at)
  values (p_donation_id, p_amount_cents, p_source, p_actor, clock_timestamp());
  update public.donations set refunded_cents = refunded_cents + p_amount_cents where id = p_donation_id;
  return 'done';
end $$;
revoke execute on function public.record_partial_refund(uuid, bigint, text, uuid) from public, anon, authenticated;
grant execute on function public.record_partial_refund(uuid, bigint, text, uuid) to service_role;

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

  -- The printed lines must add up to what the receipt certifies. They were read before the gifts were held, so a
  -- part refund recorded in between leaves them showing the old amounts: refuse, and the next run reads them again
  -- (review 20/11/2026: the stored total said R600 while the PDF added the lines up to R1 000).
  -- (The receipt run always sends its lines; a call with no lines prints none, so has nothing to disagree with.)
  if p_details ? 'donations' and (
       jsonb_typeof(p_details -> 'donations') <> 'array'
       or jsonb_array_length(p_details -> 'donations') <> array_length(p_donation_ids, 1)
       or (select coalesce(sum((x ->> 'amount_cents')::bigint), -1) from jsonb_array_elements(p_details -> 'donations') x) <> total) then
    raise exception 'The receipt lines do not add up to its total; read the donations again';
  end if;

  n := public.next_receipt_number(p_charity_id);
  ref := p_number_prefix || '-' || p_tax_year::text || '-' || lpad(n::text, greatest(4, length(n::text)), '0');

  -- Issued at the time the gifts are held (never the transaction's start), so it orders correctly against a part
  -- refund recorded on one of them (record_partial_refund takes its time the same way).
  insert into public.s18a_receipts (id, charity_id, receipt_number, donor_id, donor_identity, tax_year, amount_cents, details, issued_at)
  values (new_id, p_charity_id, n, p_donor_id, coalesce(p_donor_identity, ''), p_tax_year, total,
          p_details || jsonb_build_object('receipt_reference', ref, 'amount_cents', total), clock_timestamp());
  insert into public.s18a_receipt_donations (receipt_id, donation_id)
  select new_id, x from unnest(p_donation_ids) x;

  return query select new_id, n, ref, total;
end $$;

revoke execute on function public.issue_s18a_receipt(uuid, uuid, int, uuid[], text, jsonb, text) from public, anon, authenticated;
grant execute on function public.issue_s18a_receipt(uuid, uuid, int, uuid[], text, jsonb, text) to service_role;
