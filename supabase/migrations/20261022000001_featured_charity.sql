-- Cause of the week (22/10/2026, from Alza of Feed a Child): Givezy picks one approved charity for each
-- week, Monday to Sunday (Johannesburg calendar), and the app shows it at the top of Discover. A week with
-- no pick shows no card: nothing is chosen automatically. Givezy's admins choose; anyone may read the
-- current and coming picks of approved charities (the app reads them without signing in).

create table public.featured_charities (
  id uuid primary key default gen_random_uuid(),
  charity_id uuid not null references public.charities (id) on delete cascade,
  week_start date not null constraint featured_week_monday check (extract(isodow from week_start) = 1),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint featured_one_per_week unique (week_start)
);

alter table public.featured_charities enable row level security;
revoke all on public.featured_charities from anon, authenticated;
grant select on public.featured_charities to anon, authenticated;
create policy featured_public_read on public.featured_charities for select to anon, authenticated
  using (exists (select 1 from public.charities c where c.id = charity_id and c.status = 'approved'));
create policy no_password_sessions on public.featured_charities as restrictive for all to authenticated
  using (public.signed_in_without_password()) with check (public.signed_in_without_password());
