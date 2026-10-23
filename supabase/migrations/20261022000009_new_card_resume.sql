-- A donor who closes the new-card payment page and comes back within half an hour is sent to the same page, not
-- given a second one (23/10/2026 review): one page means one payment, so a month can't be paid twice that way.
alter table public.monthly_card_updates add column checkout_url text;
