-- "Cover the card charge" (Yehuda, 25/10/2026): a donor may add the payment provider's charge so the charity gets the
-- full gift. On a monthly donation the choice carries on every month; each month's cover is worked out from the rates
-- of the day. The amount itself is kept per payment, in donations.processing_charge_cents (already part of the total).
-- The s18A receipt shows the gift only (amount_cents), never the cover, until the tax adviser says otherwise.
alter table public.recurring_donations add column covers_card_charge boolean not null default false;
