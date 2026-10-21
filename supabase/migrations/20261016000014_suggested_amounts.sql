-- Givezy: each charity chooses its own suggested amounts for the give screens (16/10/2026).
-- Up to three, in cents, smallest first. Empty means none: a new donor types the amount.
-- The minimum donation lives in src/config/platform.ts and is checked by the server when saving.

alter table public.charities
  add column suggested_amounts_cents bigint[] not null default '{}'
  constraint charities_suggested_amounts_check
    check (cardinality(suggested_amounts_cents) <= 3 and 0 < all (suggested_amounts_cents));

-- The charity's admins change it on their profile page (same rules as the other profile fields).
grant update (suggested_amounts_cents) on public.charities to authenticated;
