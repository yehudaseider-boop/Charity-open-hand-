-- "Update my card" for a monthly donation whose card was declined (22/10/2026).
--
-- The donor pays the month that could not be collected with a new card, on the payment provider's own
-- page. Once that payment is confirmed, the new card is kept for the same monthly donation, which carries
-- on (or starts again, if it had stopped). Each such payment is listed here, so that:
--   * the confirmation knows to keep the card for that monthly donation, and for which month it paid;
--   * the monthly job never tries the old card while the donor is putting in a new one.
-- No personal details. Read and written only by the server (service role): no policies.

create table public.monthly_card_updates (
  donation_id uuid primary key references public.donations (id) on delete cascade,
  recurring_id uuid not null references public.recurring_donations (id) on delete cascade,
  period text not null check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table public.monthly_card_updates enable row level security;
revoke all on public.monthly_card_updates from anon, authenticated;
create index monthly_card_updates_recurring_idx on public.monthly_card_updates (recurring_id) where finished_at is null;
