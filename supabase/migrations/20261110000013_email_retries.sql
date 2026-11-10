-- Givezy: important emails that failed, tried again by the daily job (Yehuda "go", 10/11/2026).
--
-- A donor's gift confirmation, an s18A receipt email or a declined-card notice that failed to send is noted here
-- and tried again: an hour later (in practice the next daily run), then a day later, then three days after that.
-- After three more tries the row says gave_up and Givezy is told once, in the daily email (counts only). A send cut
-- off mid-way (it may have gone) says unknown and is never tried again by itself: a person checks it. A row older
-- than 7 days is not tried any more (gave_up).
--
-- No email address or name is kept: a row names the gift, receipt or monthly donation it belongs to, and the
-- address is read again, as it is then, at each try (an erased donor is never emailed). The payload holds only
-- what a declined-card notice needs besides the donation: the amount in cents, whether it was the final notice,
-- when it failed, and the donation's failed tries then (a newer try's notice replaces it).
--
-- Server-only: the daily job reads and writes it with the service role. No browser can read or write it.

create table public.email_retries (
  id uuid primary key default gen_random_uuid(),
  kind text not null constraint email_retry_kind check (kind in ('donation_confirmation', 's18a_receipt', 'monthly_declined')),
  -- The donation, s18A receipt or monthly donation the email belongs to.
  ref_id uuid not null,
  payload jsonb not null default '{}'::jsonb constraint email_retry_payload check (jsonb_typeof(payload) = 'object'),
  -- Tries so far, the first send included.
  tries int not null default 1 constraint email_retry_tries check (tries between 1 and 10),
  status text not null default 'waiting' constraint email_retry_status check (status in ('waiting', 'sent', 'skipped', 'gone', 'unknown', 'gave_up')),
  next_try_at timestamptz not null,
  -- A run's lock while it sends; one older than 15 minutes was cut off and is taken over.
  claimed_at timestamptz,
  -- The last failure, one short line with any email address taken out.
  last_error text constraint email_retry_error check (last_error is null or char_length(last_error) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_retry_once unique (kind, ref_id)
);
create index email_retries_due on public.email_retries (next_try_at) where status = 'waiting';

alter table public.email_retries enable row level security;
revoke all on public.email_retries from anon, authenticated;
create policy no_password_sessions on public.email_retries as restrictive for all to authenticated
  using (public.signed_in_without_password()) with check (public.signed_in_without_password());
