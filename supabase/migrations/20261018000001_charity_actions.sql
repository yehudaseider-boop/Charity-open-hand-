-- Givezy: the charity dashboard's core flow (18/10/2026, Yehuda): after every action the page says what
-- just happened, lets the person take it back, and shows what to do next.
--
-- One row per action a charity admin takes on the dashboard. `details` holds what the message needs
-- (a campaign's title, how many donors were emailed). `undo` holds what taking it back needs (the
-- values before a save, a removed row); it is null when the action can't be taken back. Rows are kept
-- for 30 days; undo is allowed for 30 minutes (src/lib/charity/done.ts).
--
-- Server-only: the website reads and writes these with the service role after checking the person
-- manages the charity. Browsers have no access at all.

create table public.charity_actions (
  id uuid primary key default gen_random_uuid(),
  charity_id uuid not null references public.charities (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  kind text not null constraint charity_action_kind check (kind ~ '^[a-z_]{3,40}$'),
  details jsonb not null default '{}'::jsonb,
  undo jsonb,
  undone_at timestamptz,
  undone_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index charity_actions_charity on public.charity_actions (charity_id, created_at desc);

alter table public.charity_actions enable row level security;
revoke all on public.charity_actions from anon, authenticated;
create policy no_password_sessions on public.charity_actions as restrictive for all to authenticated
  using (public.signed_in_without_password()) with check (public.signed_in_without_password());
