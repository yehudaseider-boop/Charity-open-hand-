-- Givezy: "Notify me at launch" on the landing page (Yehuda, 10/11/2026).
--
-- A giver leaves an email address to hear once, when Givezy launches. New personal data (POPIA): only the email,
-- when it was given, which consent wording was shown (its version) and where it came from. Nothing is emailed from
-- this list until launch, and only with Yehuda's yes. Each row carries a random token for a one-tap unsubscribe
-- link. The website's switch (appLinks.launchListOpen) stays off until this is on the database.
--
-- Server-only: written by the website's server (service role) after its checks (rate limit, honeypot, a valid
-- address); no browser can read or write it. Erasure and the data download find a row by its email address.

create table public.launch_list (
  id uuid primary key default gen_random_uuid(),
  email public.citext not null constraint launch_list_email_once unique
    constraint launch_list_email_shape check (char_length(email::text) between 3 and 254 and email::text !~ '\s' and position('@' in email::text) > 1),
  consent_version text not null constraint launch_list_consent check (char_length(consent_version) between 1 and 40),
  source text not null default 'landing' constraint launch_list_source check (source in ('landing')),
  stop_token uuid not null default gen_random_uuid() constraint launch_list_stop_token_once unique,
  created_at timestamptz not null default now()
);

alter table public.launch_list enable row level security;
-- No policies: only the service role reaches it.
revoke all on public.launch_list from anon, authenticated;
create policy no_password_sessions on public.launch_list as restrictive for all to authenticated
  using (public.signed_in_without_password()) with check (public.signed_in_without_password());

comment on table public.launch_list is
  'Emails left on the landing page to hear once at launch (10/11/2026). Server-only. Nothing is sent before launch, and only with Yehuda''s yes.';
