-- Givezy: how an online gift was paid (Yehuda, 17/11/2026).
--
-- Until now every online gift was printed on its s18A receipt as "Card (online)", true only while the payment
-- provider offered cards alone. Once Apple Pay, Google Pay, instant EFT and the like are switched on, the receipt's
-- "nature of donation" must say what actually happened. The provider tells us the method it used when it confirms
-- a payment; we keep that word as given (lower case letters, digits and underscores), set once when the gift is
-- marked paid. A gift with no value here (every gift before this change, and gifts the provider didn't say about)
-- is printed as it always was.
--
-- Additive and nullable: code that doesn't know the column keeps working, so this runs BEFORE the code that
-- writes it. Not personal data. Writes stay server-only (the donations table is closed to browsers for writes).

alter table public.donations
  add column payment_channel text
    constraint donation_payment_channel check (payment_channel is null or payment_channel ~ '^[a-z0-9_]{1,40}$');

comment on column public.donations.payment_channel is
  'How the payment provider says an online gift was paid (for example card), saved when the gift is marked paid. Null when unknown. Gifts recorded by a charity use recorded_method instead.';
