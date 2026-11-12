-- Givezy: "Use my ID ending 1234" only from gifts the account itself started (security review, 12/11/2026).
--
-- The saved SA ID number and address were read from any paid s18A gift on a donor record linked to the account. A
-- donor record is found by email, so a guest could pay a small gift with someone else's email and an ID number of
-- their choosing, and that number (and address) became the email owner's "Use my ID ending 1234".
--
-- Each gift's checkout details now record which account started it: set by the website's server (service role) only
-- when the person was signed in with that same email when the gift was started. Guest gifts, gifts a charity
-- records, and gifts started while signed in with another email leave it empty, and an empty one is never reused.
-- A monthly donation's later gifts are copied from its first gift, so they carry the same value.
--
-- Row-level security is unchanged. The table uses column grants for reading (20261106000001_security_hardening.sql),
-- and this column is deliberately NOT granted to `authenticated`: no browser session can read it, only the server
-- (service role). Browsers still cannot insert or update checkout details. Charities never see it (their lane,
-- charity_donations, lists its own columns).
--
-- Older gifts have no value, so a donor's saved ID appears again after their next gift made while signed in.

alter table public.donation_checkout_details
  add column started_by_user uuid references auth.users (id) on delete set null;

comment on column public.donation_checkout_details.started_by_user is
  'The account signed in with this same email when the gift was started (server-set). Only these gifts give "Use my ID ending 1234" and the saved address.';

create index donation_checkout_details_started_by_user on public.donation_checkout_details (started_by_user)
  where started_by_user is not null;
