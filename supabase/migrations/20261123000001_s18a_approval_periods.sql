-- Givezy: s18A approval periods (Yehuda's decision, 23/11/2026).
--
-- A gift only ever goes on an s18A receipt if the charity could issue s18A receipts (s18A approval confirmed and a
-- signed receipting mandate) at the moment the gift was paid. A gift paid while it couldn't never gets one, even if
-- the charity is approved again later. Until now issue_s18a_receipt only asked whether the charity can issue today and
-- whether the mandate was signed before the gift: a charity whose s18A status was removed and later confirmed again
-- could receipt the gifts paid in between.
--
-- 1. charity_s18a_periods: each stretch of time a charity could issue (started_at, ended_at; ended_at is null while it
--    still can). Server-only: no browser can read or write it.
-- 2. A trigger on charities opens a period when a charity becomes able to issue and closes it when it stops (Givezy's
--    admin confirming s18A or the mandate, at approval or later, and "Remove s18A status"), whatever writes the row,
--    in the same transaction. A period starts when both were in place: greatest(s18a_confirmed_at, mandate_signed_at).
--    When the charity had a period before (approved again after a removal), the new one never starts before now, so
--    the gap is never covered.
-- 3. Backfill: one open period for each charity that can issue today, from greatest(s18a_confirmed_at,
--    mandate_signed_at). Earlier periods can't be rebuilt (removing s18A clears s18a_confirmed_at).
-- 4. issue_s18a_receipt refuses a gift whose paid_at is not inside a period of the charity. Otherwise the same as
--    20261120000002_receipt_refund_timing.sql.

create table public.charity_s18a_periods (
  id uuid primary key default gen_random_uuid(),
  charity_id uuid not null references public.charities (id) on delete cascade,
  started_at timestamptz not null,
  -- Null while the charity can still issue.
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint charity_s18a_period_order check (ended_at is null or ended_at >= started_at)
);
-- At most one open period per charity.
create unique index charity_s18a_periods_one_open on public.charity_s18a_periods (charity_id) where ended_at is null;
create index charity_s18a_periods_charity on public.charity_s18a_periods (charity_id, started_at);

alter table public.charity_s18a_periods enable row level security;
revoke all on public.charity_s18a_periods from anon, authenticated;
create policy no_password_sessions on public.charity_s18a_periods as restrictive for all to authenticated
  using (public.signed_in_without_password()) with check (public.signed_in_without_password());

-- Was the charity able to issue s18A receipts at this moment? (A period includes its start, not its end.)
create or replace function public.charity_could_issue_18a_at(p_charity_id uuid, p_at timestamptz) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_at is not null and exists (
    select 1 from public.charity_s18a_periods p
    where p.charity_id = p_charity_id
      and p.started_at <= p_at
      and (p.ended_at is null or p_at < p.ended_at)
  )
$$;
revoke execute on function public.charity_could_issue_18a_at(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.charity_could_issue_18a_at(uuid, timestamptz) to service_role;

create or replace function public.track_charity_s18a_period() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  was_able boolean := tg_op = 'UPDATE' and public.charity_can_issue_18a(old);
  is_able boolean := public.charity_can_issue_18a(new);
  had_period boolean;
begin
  if is_able and not was_able then
    select exists (select 1 from public.charity_s18a_periods where charity_id = new.id) into had_period;
    insert into public.charity_s18a_periods (charity_id, started_at)
    values (new.id, case when had_period
                         then greatest(new.s18a_confirmed_at, new.mandate_signed_at, now())
                         else greatest(new.s18a_confirmed_at, new.mandate_signed_at) end)
    on conflict (charity_id) where ended_at is null do nothing;
  elsif was_able and not is_able then
    update public.charity_s18a_periods
    set ended_at = greatest(now(), started_at)
    where charity_id = new.id and ended_at is null;
  end if;
  return null;
end $$;
revoke execute on function public.track_charity_s18a_period() from public, anon, authenticated;

create trigger charities_s18a_period
  after insert or update of is_s18a, mandate_signed_at on public.charities
  for each row execute function public.track_charity_s18a_period();

-- Backfill: the charities that can issue today, from the moment both their approval and mandate were in place.
insert into public.charity_s18a_periods (charity_id, started_at)
select c.id, greatest(c.s18a_confirmed_at, c.mandate_signed_at)
from public.charities c
where public.charity_can_issue_18a(c)
  and not exists (select 1 from public.charity_s18a_periods p where p.charity_id = c.id and p.ended_at is null);

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
    -- the charity could issue s18A receipts when the gift was paid (Yehuda, 23/11/2026)
    and public.charity_could_issue_18a_at(p_charity_id, d.paid_at)
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
