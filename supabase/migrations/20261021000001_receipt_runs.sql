-- The yearly s18A receipt run, with two approvals (21/10/2026, Yehuda): after the tax year closes the
-- charity checks its list of receipts on the dashboard and approves it, then Givezy signs off in Admin
-- and the receipts are issued and emailed. The list is fingerprinted when the charity approves: if it
-- changes before sign-off (a refund, a late payment), the run goes back to the charity.
-- Server-only: the website reads and writes these with the service role after checking the person
-- manages the charity (or is a platform admin). No client can read or write them.

create type public.receipt_run_status as enum ('charity_approved', 'issuing', 'done', 'cancelled');

create table public.receipt_runs (
  id uuid primary key default gen_random_uuid(),
  charity_id uuid not null references public.charities (id) on delete cascade,
  tax_year int not null constraint receipt_run_year check (tax_year between 2020 and 2100),
  status public.receipt_run_status not null default 'charity_approved',
  -- What the charity approved: the receipts' donors, identities, donations and amounts, hashed.
  plan_fingerprint text not null constraint receipt_run_fingerprint check (plan_fingerprint ~ '^[0-9a-f]{64}$'),
  receipts_planned int not null constraint receipt_run_planned check (receipts_planned > 0),
  total_cents bigint not null constraint receipt_run_total check (total_cents > 0),
  charity_approved_by uuid references auth.users (id) on delete set null,
  charity_approved_at timestamptz not null default now(),
  signed_off_by uuid references auth.users (id) on delete set null,
  signed_off_at timestamptz,
  finished_at timestamptz,
  -- The job's summary: issued, PDFs made, emailed, what failed.
  summary jsonb,
  cancelled_at timestamptz,
  cancelled_reason text constraint receipt_run_reason check (cancelled_reason is null or char_length(cancelled_reason) between 3 and 300),
  created_at timestamptz not null default now(),
  constraint receipt_run_cancelled check ((status = 'cancelled') = (cancelled_at is not null and cancelled_reason is not null)),
  constraint receipt_run_signed_off check (status = 'charity_approved' or status = 'cancelled' or signed_off_at is not null)
);

-- One open run per charity and tax year: a second approval while one waits is refused.
create unique index receipt_runs_one_open on public.receipt_runs (charity_id, tax_year) where status in ('charity_approved', 'issuing');
create index receipt_runs_waiting on public.receipt_runs (status, charity_approved_at);

alter table public.receipt_runs enable row level security;
-- No policies: only the service role reaches it.
revoke all on public.receipt_runs from anon, authenticated;
create policy no_password_sessions on public.receipt_runs as restrictive for all to authenticated
  using (public.signed_in_without_password()) with check (public.signed_in_without_password());
