-- Donation confirmation credentials (11/10/2026).
--
-- The confirmation page used to trust the donation id in its address. Charity
-- admins can see that id (dashboard and CSV export), so it could open the
-- donor's private giving choice and contribution. The page now needs either
-- the signed-in donor or a long random credential that is sent only to the
-- donor (in the gateway return address). Only its hash is stored, in a table
-- no client can read.
create table public.donation_confirmations (
  donation_id uuid primary key references public.donations (id) on delete cascade,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

alter table public.donation_confirmations enable row level security;
-- No policies: server only (service role).
revoke all on public.donation_confirmations from anon, authenticated;
