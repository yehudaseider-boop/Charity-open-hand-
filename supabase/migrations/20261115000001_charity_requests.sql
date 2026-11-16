-- Givezy: "Request a charity" (Yehuda, 15/11/2026).
--
-- A donor who can't find their charity asks us to add it, on the website's Find a charity page or in the app. They
-- give the charity's name, and if they like where it is, a website or social link and a short note. New personal
-- data (POPIA) only when they tick "Email me when it joins": then their email address, which consent wording was
-- shown (its version), and nothing else. That address is used only to email them once, when the charity joins, and
-- is set to null as soon as that email has gone, or when we decide not to add the charity. A signed-in donor's
-- account id is kept with the request, so their data download and erasure find it.
--
-- Server-only: written by the website's server (service role) after its checks (rate limit, honeypot, lengths);
-- no browser can read or write it. Admin reads it through the server. The website's switch
-- (appLinks.charityRequestsOpen) stays off until this is on the database.

create table public.charity_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null constraint charity_requests_name check (char_length(name) between 2 and 120),
  -- The name made comparable (lower case, no punctuation), so requests for the same charity group together.
  name_key text not null constraint charity_requests_name_key check (char_length(name_key) between 1 and 120),
  town text constraint charity_requests_town check (town is null or char_length(town) between 1 and 80),
  link text constraint charity_requests_link check (link is null or (char_length(link) <= 300 and link ~ '^https?://')),
  note text constraint charity_requests_note check (note is null or char_length(note) between 1 and 500),
  notify_email public.citext
    constraint charity_requests_email_shape check (notify_email is null or (char_length(notify_email::text) between 3 and 254 and notify_email::text !~ '\s' and position('@' in notify_email::text) > 1)),
  consent_version text constraint charity_requests_consent check (consent_version is null or char_length(consent_version) between 1 and 40),
  constraint charity_requests_consent_with_email check (notify_email is null or consent_version is not null),
  requested_by uuid references auth.users (id) on delete set null,
  came_from text not null constraint charity_requests_came_from check (came_from in ('website', 'app')),
  status text not null default 'new' constraint charity_requests_status check (status in ('new', 'invited', 'joined', 'declined')),
  -- The charity it became, once it joined (Admin picks it).
  charity_id uuid references public.charities (id) on delete set null,
  -- When the "it joined" email went to this person (their address is then cleared).
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger charity_requests_updated_at before update on public.charity_requests
  for each row execute function public.set_updated_at();

create index charity_requests_open on public.charity_requests (name_key) where status in ('new', 'invited');
create index charity_requests_to_notify on public.charity_requests (charity_id) where notify_email is not null;
create index charity_requests_by_user on public.charity_requests (requested_by) where requested_by is not null;
create index charity_requests_by_email on public.charity_requests (notify_email) where notify_email is not null;

alter table public.charity_requests enable row level security;
-- No policies: only the service role reaches it.
revoke all on public.charity_requests from anon, authenticated;
create policy no_password_sessions on public.charity_requests as restrictive for all to authenticated
  using (public.signed_in_without_password()) with check (public.signed_in_without_password());

comment on table public.charity_requests is
  'Donors asking for a charity that is not on Givezy yet (15/11/2026). Server-only. notify_email only with consent, cleared once the one "it joined" email has gone.';
