-- Thank-you emails: a charity writes one thank-you and Givezy emails it to everyone who gave in a
-- month. The charity never handles addresses. One per charity per month of donations.
create table public.charity_thank_yous (
  id uuid primary key default gen_random_uuid(),
  charity_id uuid not null references public.charities (id) on delete cascade,
  period_month date not null check (extract(day from period_month) = 1),
  body text not null check (char_length(body) between 10 and 1000),
  sent_by uuid references auth.users (id) on delete set null,
  sent_at timestamptz not null default now(),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  unique (charity_id, period_month)
);
alter table public.charity_thank_yous enable row level security;
create policy charity_thank_yous_read on public.charity_thank_yous for select to authenticated
  using (public.is_charity_admin(charity_id) or public.is_platform_admin());
revoke insert, update, delete on public.charity_thank_yous from anon, authenticated;

-- Donors who asked not to get thank-you emails from charities. Only a hash of the address is kept.
create table public.thank_you_opt_outs (
  email_hash text primary key check (email_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
alter table public.thank_you_opt_outs enable row level security;
revoke all on public.thank_you_opt_outs from anon, authenticated;

-- The "stop these emails" link in each thank-you: a random token (stored hashed) for one address.
create table public.email_stop_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
alter table public.email_stop_tokens enable row level security;
revoke all on public.email_stop_tokens from anon, authenticated;
