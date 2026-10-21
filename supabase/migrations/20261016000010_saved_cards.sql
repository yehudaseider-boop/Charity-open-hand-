-- A donor's saved card for once-off gifts (off until SAVED_CARDS=yes on the server).
--
-- The payment partner keeps the card. We keep only its reusable token, encrypted, plus the brand,
-- last four digits and expiry to show "Card ending 4242". Never card numbers. One card per account,
-- good for a gift to any charity. Read and written only by the server (service role): there are no
-- policies, so signed-in users cannot read even their own row, and the app learns the last four
-- digits from the server instead.

create table public.saved_cards (
  user_id uuid primary key references auth.users (id) on delete cascade,
  authorization_encrypted text not null,
  card_brand text,
  card_last4 text check (card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  card_exp text,
  gateway text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.saved_cards enable row level security;
revoke all on public.saved_cards from anon, authenticated;
create trigger saved_cards_updated_at before update on public.saved_cards
  for each row execute function public.set_updated_at();

-- "Save my card" ticked on a once-off gift: the card is kept once that payment is confirmed.
create table public.card_save_requests (
  donation_id uuid primary key references public.donations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.card_save_requests enable row level security;
revoke all on public.card_save_requests from anon, authenticated;
create index card_save_requests_user_idx on public.card_save_requests (user_id);

-- What the donor agreed to: keeping their card for future gifts, until they remove it.
alter table public.consents drop constraint consents_kind_check;
alter table public.consents add constraint consents_kind_check check (kind in (
  'account', 'donation', 'charity_declarations', 'monthly_authorisation',
  'saved_card'  -- donor allowed us to keep their card for future once-off gifts
));
alter table public.consents drop constraint consent_has_subject;
alter table public.consents add constraint consent_has_subject check (
  (kind = 'account' and user_id is not null)
  or (kind in ('donation', 'monthly_authorisation', 'saved_card') and donation_id is not null)
  or (kind = 'charity_declarations' and charity_id is not null)
);
