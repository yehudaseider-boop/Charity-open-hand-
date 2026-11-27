-- Part refunds: the same refund never counted twice, decided while the gift is held (code review, 27/11/2026).
--
-- The app checked for a refund of the same amount before asking the database to record one. Two ways through:
--   1. An admin's hand entry and the payment provider's report of the same refund arriving at the same moment each
--      saw none, and both were counted.
--   2. After an admin ticked "a second, separate refund", the provider's delayed report of that second refund was
--      counted as a third.
-- Now the database decides, under the same lock that guards the total:
--   'refuse'          (an admin entry, box not ticked): any refund of this amount already on the gift: 'same_amount'.
--   'allow'           (an admin entry, box ticked): recorded.
--   'hold_if_by_hand' (the provider's report): a refund of this amount recorded by hand: 'same_amount', and the app
--                     holds the gift for a person. Two provider reports of the same amount are two refunds (each is
--                     keyed by the refund itself), so those are recorded.
-- Server-only, as before.

drop function if exists public.record_partial_refund(uuid, bigint, text, uuid);

create or replace function public.record_partial_refund(
  p_donation_id uuid,
  p_amount_cents bigint,
  p_source text,
  p_actor uuid default null,
  p_same_amount text default 'refuse'
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
  if p_same_amount is null or p_same_amount not in ('refuse', 'allow', 'hold_if_by_hand') then
    raise exception 'Unknown rule for a refund of the same amount';
  end if;
  -- Hold the gift, so a receipt being issued at the same moment waits for the refund (or the refund for it), and so
  -- two refunds of the same amount arriving together are decided one after the other.
  select * into d from public.donations where id = p_donation_id for update;
  if not found then return 'not_found'; end if;
  if exists (select 1 from public.donation_refunds where source = p_source) then return 'already'; end if;
  if d.status <> 'paid' then return 'not_paid'; end if;
  if p_same_amount = 'refuse' and exists (
       select 1 from public.donation_refunds where donation_id = p_donation_id and amount_cents = p_amount_cents) then
    return 'same_amount';
  end if;
  if p_same_amount = 'hold_if_by_hand' and exists (
       select 1 from public.donation_refunds where donation_id = p_donation_id and amount_cents = p_amount_cents and source like 'admin:%') then
    return 'same_amount';
  end if;
  if d.refunded_cents + p_amount_cents > d.amount_cents then return 'too_much'; end if;
  -- The time is taken now, while the gift is held (never the transaction's start): a receipt issued before this
  -- refund always has an earlier time, and one issued after it a later one (review 20/11/2026).
  insert into public.donation_refunds (donation_id, amount_cents, source, recorded_by, created_at)
  values (p_donation_id, p_amount_cents, p_source, p_actor, clock_timestamp());
  update public.donations set refunded_cents = refunded_cents + p_amount_cents where id = p_donation_id;
  return 'done';
end $$;
revoke execute on function public.record_partial_refund(uuid, bigint, text, uuid, text) from public, anon, authenticated;
grant execute on function public.record_partial_refund(uuid, bigint, text, uuid, text) to service_role;
