-- Open Hand: issuing s18A receipts.
--
-- One call issues one annual receipt for one donor, for one charity, for one
-- tax year, in a single transaction: the receipt number is taken, the receipt
-- is written and every donation it covers is linked. If anything is wrong the
-- whole call is refused and no number is used up.
--
-- The rules are enforced here, not just in the job that calls it:
--   * every donation must be paid, belong to this charity and donor, fall in
--     this tax year, have asked for an 18A receipt, and not already be on a
--     receipt (an issued one);
--   * the charity must be able to issue 18A (approved s18A and a signed mandate)
--     and the mandate must have been signed before the donation was paid;
--   * the receipt amount is the sum of the donations' gift amounts (never the
--     processing fee), worked out here, never passed in;
--   * only the server (service role) can call it.

create or replace function public.issue_s18a_receipt(
  p_charity_id uuid,
  p_donor_id uuid,
  p_tax_year int,
  p_donation_ids uuid[],
  p_number_prefix text,
  p_details jsonb
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

  select count(*) into found_count from public.donations where id = any (p_donation_ids);
  if found_count <> array_length(p_donation_ids, 1) then
    raise exception 'A listed donation does not exist';
  end if;

  select count(*), coalesce(sum(d.amount_cents), 0) into good_count, total
  from public.donations d
  where d.id = any (p_donation_ids)
    and d.status = 'paid'
    and d.charity_id = p_charity_id
    and d.donor_id = p_donor_id
    and d.tax_year = p_tax_year
    and d.wants_18a
    and c.mandate_signed_at <= d.paid_at
    and not exists (
      select 1 from public.s18a_receipt_donations l
      join public.s18a_receipts r on r.id = l.receipt_id
      where l.donation_id = d.id and r.status = 'issued'
    );
  if good_count <> array_length(p_donation_ids, 1) then
    raise exception 'A listed donation is not eligible for this receipt';
  end if;

  n := public.next_receipt_number(p_charity_id);
  ref := p_number_prefix || '-' || p_tax_year::text || '-' || lpad(n::text, 4, '0');

  insert into public.s18a_receipts (id, charity_id, receipt_number, donor_id, tax_year, amount_cents, details)
  values (new_id, p_charity_id, n, p_donor_id, p_tax_year, total,
          p_details || jsonb_build_object('receipt_reference', ref, 'amount_cents', total));
  insert into public.s18a_receipt_donations (receipt_id, donation_id)
  select new_id, x from unnest(p_donation_ids) x;

  return query select new_id, n, ref, total;
end $$;

revoke execute on function public.issue_s18a_receipt(uuid, uuid, int, uuid[], text, jsonb) from public, anon, authenticated;
grant execute on function public.issue_s18a_receipt(uuid, uuid, int, uuid[], text, jsonb) to service_role;

-- Receipt PDFs are small and only PDFs.
update storage.buckets set file_size_limit = 2097152, allowed_mime_types = array['application/pdf'] where id = 'receipts';
