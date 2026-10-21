-- Deposits (21/10/2026, Juan of the Angel Network): the payment provider pays a charity once a day, with
-- its fees taken off, so the bank shows less than the gifts. Each payout and its lines are read from the
-- provider once a day, so a bookkeeper can see which gifts a deposit is made of, each fee, and what reached
-- the bank. The provider's own figures are kept as it gives them; Givezy never works a fee out itself.
-- Server-only: the website reads these with the service role after checking the person manages the
-- charity. No client can read or write them.

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  charity_id uuid not null references public.charities (id) on delete cascade,
  gateway text not null,
  gateway_payout_ref text not null constraint payout_ref check (char_length(gateway_payout_ref) between 1 and 200),
  paid_out_on date not null,
  amount_cents bigint not null,
  status text not null constraint payout_status check (status in ('paid', 'pending', 'failed')),
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payouts_once unique (gateway, gateway_payout_ref)
);
create index payouts_charity on public.payouts (charity_id, paid_out_on desc);

create table public.payout_lines (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references public.payouts (id) on delete cascade,
  -- The gift this line is about, when it matches one of ours (by its reference).
  donation_id uuid references public.donations (id) on delete set null,
  gateway_reference text,
  kind text not null constraint payout_line_kind check (kind in ('payment', 'refund', 'chargeback', 'other')),
  gross_cents bigint not null,
  fee_cents bigint not null constraint payout_line_fee check (fee_cents >= 0),
  net_cents bigint not null,
  line_no int not null,
  constraint payout_lines_once unique (payout_id, line_no)
);
create index payout_lines_payout on public.payout_lines (payout_id);
create index payout_lines_donation on public.payout_lines (donation_id) where donation_id is not null;

alter table public.payouts enable row level security;
alter table public.payout_lines enable row level security;
-- No policies: only the service role reaches them.
revoke all on public.payouts from anon, authenticated;
revoke all on public.payout_lines from anon, authenticated;
create policy no_password_sessions on public.payouts as restrictive for all to authenticated
  using (public.signed_in_without_password()) with check (public.signed_in_without_password());
create policy no_password_sessions on public.payout_lines as restrictive for all to authenticated
  using (public.signed_in_without_password()) with check (public.signed_in_without_password());
