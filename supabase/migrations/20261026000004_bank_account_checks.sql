-- Givezy: the payment provider's check of a charity's bank account (26/10/2026).
--
-- When a charity's bank details are saved or changed, Givezy asks the payment provider whether the account is open,
-- takes payments in and is in the charity's name. The answer is shown to the Givezy admin on the charity's page. It
-- is information only: it never approves anything, and a charity is never held up because the check couldn't run.
-- One row per charity: the latest check, with the last four digits of the account it was for (so an old answer is
-- never shown against a new account). Server only.

create table public.charity_bank_checks (
  charity_id uuid primary key references public.charities (id) on delete cascade,
  account_last4 text not null constraint bank_check_last4 check (account_last4 ~ '^[0-9]{4}$'),
  checked_at timestamptz not null default now(),
  -- 'checked': the provider answered. 'not_checked': it couldn't be asked (unreachable, bank not supported, no check
  -- with this provider). The five answers are filled only when checked.
  outcome text not null constraint bank_check_outcome check (outcome in ('checked', 'not_checked')),
  verified boolean,
  account_open boolean,
  accepts_credits boolean,
  holder_matches boolean,
  open_three_months boolean,
  message text constraint bank_check_message check (message is null or char_length(message) <= 300)
);
alter table public.charity_bank_checks enable row level security;
revoke all on public.charity_bank_checks from anon, authenticated;
