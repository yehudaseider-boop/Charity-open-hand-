-- POPIA: a record of what each person agreed to, and their requests about
-- their own information.

-- ---------------------------------------------------------------------------
-- 1. Agreements. One row each time someone agrees, with the version of the
--    Terms and Privacy Policy they saw. Written by the server only.
-- ---------------------------------------------------------------------------
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in (
    'account',              -- signed-in person agreed to the Terms and Privacy Policy
    'donation',             -- donor agreed to the Terms, Privacy Policy and sharing with the charity
    'charity_declarations'  -- charity applicant's declarations on submitting
  )),
  policy_version text not null,
  user_id uuid references auth.users (id) on delete set null,
  donation_id uuid references public.donations (id) on delete cascade,
  charity_id uuid references public.charities (id) on delete cascade,
  accepted_at timestamptz not null default now(),
  constraint consent_has_subject check (
    (kind = 'account' and user_id is not null)
    or (kind = 'donation' and donation_id is not null)
    or (kind = 'charity_declarations' and charity_id is not null and user_id is not null)
  )
);
create index consents_user_idx on public.consents (user_id, kind, accepted_at desc);
create index consents_donation_idx on public.consents (donation_id);

alter table public.consents enable row level security;
revoke all on public.consents from anon, authenticated;
grant select on public.consents to authenticated;
create policy consents_own_read on public.consents for select to authenticated
  using (user_id = (select auth.uid()) or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 2. Requests about one's own information (POPIA sections 23 and 24):
--    correct it, delete it, or object. Handled by the Information Officer.
-- ---------------------------------------------------------------------------
create table public.data_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('delete', 'correct', 'object')),
  details text check (char_length(details) <= 2000),
  status text not null default 'open' check (status in ('open', 'done', 'declined')),
  response text check (char_length(response) <= 2000),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references auth.users (id)
);
create index data_requests_open_idx on public.data_requests (status, created_at);

alter table public.data_requests enable row level security;
revoke all on public.data_requests from anon, authenticated;
grant select on public.data_requests to authenticated;
create policy data_requests_read on public.data_requests for select to authenticated
  using (user_id = (select auth.uid()) or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 3. Rate-limit rows (IP addresses, emails) are cleared after about a day.
-- ---------------------------------------------------------------------------
create index if not exists rate_limit_created_idx on public.rate_limit_events (created_at);
