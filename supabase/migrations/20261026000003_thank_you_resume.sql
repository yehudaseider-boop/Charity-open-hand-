-- Givezy: a monthly thank-you that stops part way can be finished (26/10/2026, code check).
--
-- A thank-you to a few hundred donors could run out of time part way. The month stayed claimed, so the rest of
-- the donors were never thanked and pressing again said "already thanked". Now each donor's address is claimed
-- (as a hash, never the address) before their email goes, so "Send the rest" carries on where it stopped and
-- never emails anyone twice. finished_at marks a thank-you that reached everyone.

alter table public.charity_thank_yous add column finished_at timestamptz;
-- Thank-yous sent before this change are treated as finished, as they were shown before.
update public.charity_thank_yous set finished_at = sent_at where finished_at is null;

create table public.charity_thank_you_recipients (
  thank_you_id uuid not null references public.charity_thank_yous (id) on delete cascade,
  email_hash text not null constraint thank_you_recipient_hash check (email_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'sending' constraint thank_you_recipient_status check (status in ('sending', 'sent', 'failed')),
  claimed_at timestamptz not null default now(),
  primary key (thank_you_id, email_hash)
);
-- Server only, like the appeal recipients.
alter table public.charity_thank_you_recipients enable row level security;
revoke all on public.charity_thank_you_recipients from anon, authenticated;
